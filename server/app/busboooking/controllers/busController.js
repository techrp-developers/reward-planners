const db = require("../../../config/database");
const srdvClient = require("../utils/srdvClient");
const crypto = require("crypto");
const razorpay = require("../../service/v1/middlewares/razorpay");
const BusModel =
    require("../models/busModel");

const BusBookingOrderModel =
  require(
    "../models/busBookingOrderModel"
  );
const {
  isExpectedCapturedPayment,
  getBlockTtlMinutes,
  isBlockExpired,
  isAmbiguousProviderError,
} = require("../utils/workflowPolicy");
const {
  bookOrder,
  waitForBookingResult,
  resolveReviewedBooking,
  applyCancellationSuccess,
  resolveCancellation,
  reconcileProviderCancellations,
} = require("../services/bookingService");
const { processRefund } = require("../services/refundService");
const { validateBlockRequest } = require("../utils/blockRequest");
const { sendOpsAlert } = require("../../../services/alertService");
/*
|--------------------------------------------------------------------------
| GET CITIES
|--------------------------------------------------------------------------
|
| GET /api/busbooking/cities
|
| or
|
| GET /api/busbooking/cities?q=pun
|
|--------------------------------------------------------------------------
*/

const getCities = async (req, res) => {

    try {

        const { q } = req.query;

        let cities;


        if (q && q.trim()) {

            cities =
                await BusModel.searchCities(
                    q.trim()
                );

        } else {

            cities =
                await BusModel.getAllCities();
        }


        return res.status(200).json({

            success: true,

            count: cities.length,

            data: cities
        });


    } catch (error) {

        console.error(
            "Get Cities Error:",
            error
        );


        return res.status(500).json({

            success: false,

            message:
                "Unable to get cities",

            error:
                error.message
        });
    }
};


/*
|--------------------------------------------------------------------------
| Validate Journey Date
|--------------------------------------------------------------------------
|
| Required format:
| YYYY-MM-DD
|
|--------------------------------------------------------------------------
*/

const isValidDate = (date) => {
    const value = String(date || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

    const [year, month, day] = value.split("-").map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return parsed.getUTCFullYear() === year &&
        parsed.getUTCMonth() === month - 1 &&
        parsed.getUTCDate() === day;
};


/*
|--------------------------------------------------------------------------
| Current Journey Date and City-Code Validation
|--------------------------------------------------------------------------
|
| Provider city codes must be positive integers. Search dates must be valid
| YYYY-MM-DD calendar dates and cannot be earlier than today.
|
|--------------------------------------------------------------------------
*/

const getTodayDate = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
};

const parsePositiveInteger = (value) => {
    const normalized = String(value ?? "").trim();
    if (!/^\d+$/.test(normalized)) return null;

    const cityCode = Number(normalized);
    return Number.isSafeInteger(cityCode) && cityCode > 0
        ? cityCode
        : null;
};

const getMissingSearchConfig = () => {

    const requiredEnvKeys = [
        "SRDV_SEARCH_URL",
        "SRDV_API_TOKEN",
    ];

    return requiredEnvKeys.filter((key) => {
        const value = process.env[key];
        return !value || !String(value).trim();
    });
};

const getOptionalCityDetails = async (cityId) => {

    if (!cityId) {
        return null;
    }

    try {
        return await BusModel.getCityById(cityId);
    } catch (error) {
        console.error("Optional city lookup failed:", error.message);
        return null;
    }
};


/*
|--------------------------------------------------------------------------
| SEARCH BUSES
|--------------------------------------------------------------------------
|
| POST
| /api/busbooking/search
|
|--------------------------------------------------------------------------
*/

const searchBuses = async (req, res) => {

    try {

        const {

            sourceCityCode,

            destinationCityCode,

            journeyDate

        } = req.body;

        const fromCityCode = parsePositiveInteger(sourceCityCode);
        const toCityCode = parsePositiveInteger(destinationCityCode);


        /*
        |--------------------------------------------------------------------------
        | Source City Validation
        |--------------------------------------------------------------------------
        */

        if (!fromCityCode) {

            return res
                .status(400)
                .json({

                    success: false,

                    message:
                        "Source city code must be a positive integer"
                });
        }


        /*
        |--------------------------------------------------------------------------
        | Destination City Validation
        |--------------------------------------------------------------------------
        */

        if (!toCityCode) {

            return res
                .status(400)
                .json({

                    success: false,

                    message:
                        "Destination city code must be a positive integer"
                });
        }


        /*
        |--------------------------------------------------------------------------
        | Same City Validation
        |--------------------------------------------------------------------------
        */

        if (
            fromCityCode ===
            toCityCode
        ) {

            return res
                .status(400)
                .json({

                    success: false,

                    message:
                        "Source and destination cannot be same"
                });
        }


        /*
        |--------------------------------------------------------------------------
        | Journey Date Validation
        |--------------------------------------------------------------------------
        */

        if (!isValidDate(journeyDate)) {

            return res
                .status(400)
                .json({

                    success: false,

                    message:
                        "Journey date must be in YYYY-MM-DD format"
                });
        }


        /*
        |--------------------------------------------------------------------------
        | Journey Time Validation
        |--------------------------------------------------------------------------
        */

        if (journeyDate < getTodayDate()) {

            return res
                .status(400)
                .json({

                    success: false,

                    message:
                        "Journey date cannot be in the past"
                });
        }


        /*
        |--------------------------------------------------------------------------
        | Optional Source / Destination City Lookup
        |--------------------------------------------------------------------------
        */

        const sourceCity =
            await getOptionalCityDetails(
                fromCityCode
            );

        const destinationCity =
            await getOptionalCityDetails(
                toCityCode
            );

        if (!sourceCity || !destinationCity) {
            return res.status(400).json({
                success: false,
                message: "Source or destination city code is not present in the current bus city list",
            });
        }

        const missingConfig =
            getMissingSearchConfig();

        if (missingConfig.length > 0) {

            return res
                .status(500)
                .json({

                    success: false,

                    message:
                        "Bus booking provider configuration is missing",

                    missingConfig
                });
        }


        /*
        |--------------------------------------------------------------------------
        | Prepare SRDV Search Request
        |--------------------------------------------------------------------------
        |
        | Keep the exact property names required by your existing
        | SRDV Search API.
        |
        |--------------------------------------------------------------------------
        */

        const requestBody = {

            FromCityCode:
                fromCityCode,

            ToCityCode:
                toCityCode,

            DepartDate:
                journeyDate
        };


        /*
        |--------------------------------------------------------------------------
        | Call SRDV Search Bus API
        |--------------------------------------------------------------------------
        */

        const srdvResponse =
            await srdvClient.post(

                process.env.SRDV_SEARCH_URL,

                requestBody,

                {
                    headers: {

                        "Api-Token":
                            process.env
                                .SRDV_API_TOKEN,

                        "Content-Type":
                            "application/json"
                    },

                    timeout: 30000
                }
            );


        const apiData =
            srdvResponse.data;


        /*
        |--------------------------------------------------------------------------
        | Provider Error Check
        |--------------------------------------------------------------------------
        */

        if (
            apiData?.Error &&
            Number(
                apiData.Error.ErrorCode
            ) !== 0
        ) {

            return res
                .status(400)
                .json({

                    success: false,

                    message:
                        apiData.Error
                            .ErrorMessage ||
                        "Bus provider returned an error",

                    providerError:
                        apiData.Error
                });
        }


        /*
        |--------------------------------------------------------------------------
        | Get Bus Results
        |--------------------------------------------------------------------------
        */

        const allBuses =
            Array.isArray(
                apiData.Result
            )
                ? apiData.Result
                : [];


        /*
        |--------------------------------------------------------------------------
        | Return Provider Results Without Client-side Time Filtering
        |--------------------------------------------------------------------------
        |
        | User:
        |
        | The new Search contract accepts the journey date only.
        |
        | API Result:
        |
        | 11:00 ❌
        | 17:00 ❌
        | 19:00 ✅
        | 22:00 ✅
        |
        |--------------------------------------------------------------------------
        */

        /*
        |--------------------------------------------------------------------------
        | Final Mobile App Response
        |--------------------------------------------------------------------------
        */

        return res
            .status(200)
            .json({

                success: true,

                message:
                    allBuses.length > 0
                        ? "Buses found successfully"
                        : "No buses found",


                search: {

                    source: {

                        code:
                            String(fromCityCode),

                        name:
                            sourceCity
                                ?.city_name || null
                    },


                    destination: {

                        code:
                            String(toCityCode),

                        name:
                            destinationCity
                                ?.city_name || null
                    },


                    journeyDate
                },


                traceId:
                    apiData.TraceId ??
                    null,


                totalBusesFromProvider:
                    allBuses.length,


                count:
                    allBuses.length,


                buses:
                    allBuses
            });


    } catch (error) {

        /*
        |--------------------------------------------------------------------------
        | SRDV API HTTP Error
        |--------------------------------------------------------------------------
        */

        if (error.response) {

            console.error(
                "SRDV API Error:",
                error.response.data
            );


            return res
                .status(
                    error.response
                        .status || 500
                )
                .json({

                    success: false,

                    message:
                        "Bus provider API error",

                });
        }


        /*
        |--------------------------------------------------------------------------
        | Other Error
        |--------------------------------------------------------------------------
        */

        console.error(
            "Search Bus Error:",
            error.message
        );


        return res
            .status(500)
            .json({

                success: false,

                message:
                    "Unable to search buses",

                error:
                    error.message
            });
    }
};

/*
|--------------------------------------------------------------------------
| GET SEAT LAYOUT
|--------------------------------------------------------------------------
|
| POST
| /api/busbooking/seat-layout
|
| Frontend sends:
|
| {
|   "traceId": 2620051,
|   "resultIndex": "39_2000005756960059855"
| }
|
|--------------------------------------------------------------------------
*/

const getSeatLayout = async (req, res) => {

    try {

        /*
        |--------------------------------------------------------------------------
        | Get Data From Frontend
        |--------------------------------------------------------------------------
        */

        const {
            traceId,
            resultIndex,
            boardingPointId,
            droppingPointId
        } = req.body;

        const normalizedTraceId = parsePositiveInteger(traceId);
        const normalizedResultIndex = String(resultIndex ?? "").trim();
        const normalizePointId = (value) => {
            if (value === undefined || value === null) return null;
            if (typeof value !== "string" && typeof value !== "number") return null;
            const normalized = String(value).trim();
            return normalized.length >= 1 && normalized.length <= 100
                ? normalized
                : null;
        };
        const hasBoardingPoint = boardingPointId !== undefined && boardingPointId !== null;
        const hasDroppingPoint = droppingPointId !== undefined && droppingPointId !== null;
        const normalizedBoardingPointId = normalizePointId(boardingPointId);
        const normalizedDroppingPointId = normalizePointId(droppingPointId);


        console.log("======================================");
        console.log("SEAT LAYOUT REQUEST RECEIVED");
        console.log("TraceId:", traceId);
        console.log("ResultIndex:", resultIndex);
        console.log("======================================");


        /*
        |--------------------------------------------------------------------------
        | Validation
        |--------------------------------------------------------------------------
        */

        if (!normalizedTraceId) {

            return res
                .status(400)
                .json({

                    success: false,

                    message:
                        "TraceId must be a positive integer"
                });
        }

        if (
            normalizedResultIndex.length < 3 ||
            normalizedResultIndex.length > 500
        ) {

            return res
                .status(400)
                .json({

                    success: false,

                    message:
                        "ResultIndex must contain between 3 and 500 characters"
                });
        }

        if (hasBoardingPoint !== hasDroppingPoint) {
            return res.status(400).json({
                success: false,
                message: "BoardingPointId and DroppingPointId must be provided together",
            });
        }

        if (
            (hasBoardingPoint && !normalizedBoardingPointId) ||
            (hasDroppingPoint && !normalizedDroppingPointId)
        ) {
            return res.status(400).json({
                success: false,
                message: "BoardingPointId and DroppingPointId must contain between 1 and 100 characters",
            });
        }


        /*
        |--------------------------------------------------------------------------
        | Check Environment Configuration
        |--------------------------------------------------------------------------
        */

        const requiredConfig = [
            "SRDV_SEAT_LAYOUT_URL",
            "SRDV_API_TOKEN",
        ];


        const missingConfig =
            requiredConfig.filter(
                (key) => {

                    return (
                        !process.env[key] ||
                        !String(
                            process.env[key]
                        ).trim()
                    );
                }
            );


        if (missingConfig.length > 0) {

            console.error(
                "Missing Seat Layout Config:",
                missingConfig
            );


            return res
                .status(500)
                .json({

                    success: false,

                    message:
                        "Seat layout provider configuration is missing",

                    missingConfig
                });
        }


        /*
        |--------------------------------------------------------------------------
        | Prepare Provider Request
        |--------------------------------------------------------------------------
        */

        const requestBody = {
            TraceId:
                normalizedTraceId,

            ResultIndex:
                normalizedResultIndex
        };

        if (normalizedBoardingPointId && normalizedDroppingPointId) {
            requestBody.BoardingPointId = normalizedBoardingPointId;
            requestBody.DroppingPointId = normalizedDroppingPointId;
        }


        /*
        |--------------------------------------------------------------------------
        | Debug Provider Request
        |--------------------------------------------------------------------------
        |
        | Do NOT print password in production.
        |
        |--------------------------------------------------------------------------
        */

        console.log(
            "======================================"
        );

        console.log(
            "GET SEAT LAYOUT PROVIDER REQUEST"
        );

        console.log({

            TraceId:
                requestBody.TraceId,

            ResultIndex:
                requestBody.ResultIndex,

            BoardingPointId:
                requestBody.BoardingPointId,

            DroppingPointId:
                requestBody.DroppingPointId
        });

        console.log(
            "======================================"
        );


        /*
        |--------------------------------------------------------------------------
        | Call Provider GetSeatLayout API
        |--------------------------------------------------------------------------
        */

        const providerResponse =
            await srdvClient.post(

                process.env
                    .SRDV_SEAT_LAYOUT_URL,

                requestBody,

                {
                    headers: {

                        "Content-Type":
                            "application/json",

                        "Api-Token":
                            process.env
                                .SRDV_API_TOKEN
                    },

                    timeout: 30000
                }
            );


        /*
        |--------------------------------------------------------------------------
        | Provider Response
        |--------------------------------------------------------------------------
        */

        const apiData =
            providerResponse.data;


        console.log(
            "======================================"
        );

        console.log(
            "GET SEAT LAYOUT PROVIDER RESPONSE"
        );

        console.log(
            JSON.stringify(
                apiData,
                null,
                2
            )
        );

        console.log(
            "======================================"
        );


        /*
        |--------------------------------------------------------------------------
        | Provider Error Check
        |--------------------------------------------------------------------------
        */

        if (
            apiData?.Error &&
            Number(
                apiData.Error.ErrorCode
            ) !== 0
        ) {

            return res
                .status(400)
                .json({

                    success: false,

                    message:
                        apiData.Error
                            .ErrorMessage ||
                        "Unable to get seat layout",

                    providerError:
                        apiData.Error
                });
        }


        /*
        |--------------------------------------------------------------------------
        | Extract Seat Layout
        |--------------------------------------------------------------------------
        |
        | Your provider response:
        |
        | Result: [
        |   [
        |      seat1,
        |      seat2,
        |      ...
        |   ]
        | ]
        |
        |--------------------------------------------------------------------------
        */

        // The provider sends rows as an array, or as an object keyed by row
        // number when rows are skipped (aisles), so accept both.
        const normalizeLayoutRows = (layout) =>
            Object.values(layout || {}).map((row) => {
                if (row && typeof row === "object" && "SeatName" in row) {
                    return [row];
                }
                return Object.values(row || {});
            });

        const seatLayout =
            normalizeLayoutRows(apiData.Result);

        const upperSeatLayout =
            normalizeLayoutRows(apiData.ResultUpperSeat);


        /*
        |--------------------------------------------------------------------------
        | Flatten Seats
        |--------------------------------------------------------------------------
        |
        | Provider gives nested arrays.
        |
        | [
        |   [
        |     seat1,
        |     seat2
        |   ]
        | ]
        |
        | Convert to:
        |
        | [
        |   seat1,
        |   seat2
        | ]
        |
        |--------------------------------------------------------------------------
        */

        const seats = [
            ...seatLayout.flat(),
            ...upperSeatLayout.flat(),
        ];


        /*
        |--------------------------------------------------------------------------
        | Available Seats
        |--------------------------------------------------------------------------
        */

        const availableSeats =
            seats.filter(
                (seat) => {

                    return (
                        seat.SeatStatus === true ||
                        seat.SeatStatus === "true" ||
                        seat.SeatStatus === 1 ||
                        seat.SeatStatus === "1"
                    );
                }
            );


        /*
        |--------------------------------------------------------------------------
        | Final Response To React Native
        |--------------------------------------------------------------------------
        */

        return res
            .status(200)
            .json({

                success: true,

                message:
                    "Seat layout fetched successfully",


                traceId:
                    apiData.TraceId ??
                    normalizedTraceId,


                srdvIndex:
                    apiData.SrdvIndex ??
                    null,


                resultIndex:
                    apiData.ResultIndex ??
                    normalizedResultIndex,


                providerAvailableSeats:
                    apiData.AvailableSeats ??
                    null,


                paxIdRequired:
                    apiData.PaxIdRequired ||
                    null,


                totalSeats:
                    seats.length,


                availableSeats:
                    availableSeats.length,


                seats:
                    seats,


                layout:
                    seatLayout,


                upperLayout:
                    upperSeatLayout
            });


    } catch (error) {

        /*
        |--------------------------------------------------------------------------
        | Provider HTTP Error
        |--------------------------------------------------------------------------
        */

        if (error.response) {

            console.error(
                "======================================"
            );

            console.error(
                "GET SEAT LAYOUT PROVIDER ERROR"
            );

            console.error(
                "Status:",
                error.response.status
            );

            console.error(
                "Response:",
                error.response.data
            );

            console.error(
                "======================================"
            );


            return res
                .status(
                    error.response
                        .status || 500
                )
                .json({

                    success: false,

                    message:
                        "Seat layout provider API error",

                });
        }


        /*
        |--------------------------------------------------------------------------
        | Network / Internal Error
        |--------------------------------------------------------------------------
        */

        console.error(
            "======================================"
        );

        console.error(
            "GET SEAT LAYOUT ERROR"
        );

        console.error(
            error.message
        );

        console.error(
            "======================================"
        );


        return res
            .status(500)
            .json({

                success: false,

                message:
                    "Unable to get seat layout",

                error:
                    error.message
            });
    }
};


/*
|--------------------------------------------------------------------------
| GET BOARDING AND DROPPING POINTS
|--------------------------------------------------------------------------
|
| POST
| /api/busbooking/boarding-dropping-points
|
| Frontend sends:
|
| {
|   "traceId": 2620039,
|   "resultIndex": "39_2000000156940117941"
| }
|
|--------------------------------------------------------------------------
*/

const getBoardingDroppingPoints = async (
  req,
  res
) => {

  try {

    /*
    |--------------------------------------------------------------------------
    | Get Data From Frontend
    |--------------------------------------------------------------------------
    */

    const {
      traceId,
      resultIndex,
    } = req.body;

    const normalizedTraceId = parsePositiveInteger(traceId);
    const normalizedResultIndex = String(resultIndex ?? "").trim();


    console.log(
      "======================================"
    );

    console.log(
      "BOARDING / DROPPING REQUEST RECEIVED"
    );

    console.log(
      "TraceId:",
      traceId
    );

    console.log(
      "ResultIndex:",
      resultIndex
    );

    console.log(
      "======================================"
    );


    /*
    |--------------------------------------------------------------------------
    | Validation
    |--------------------------------------------------------------------------
    */

    if (
      !normalizedTraceId
    ) {

      return res
        .status(400)
        .json({

          success: false,

          message:
            "TraceId must be a positive integer",
        });
    }

    if (
      normalizedResultIndex.length < 3 ||
      normalizedResultIndex.length > 500
    ) {

      return res
        .status(400)
        .json({

          success: false,

          message:
            "ResultIndex must contain between 3 and 500 characters",
        });
    }


    /*
    |--------------------------------------------------------------------------
    | Environment Validation
    |--------------------------------------------------------------------------
    */

    const requiredConfig = [

      "SRDV_BOARDING_DROPPING_URL",

      "SRDV_API_TOKEN",



    ];


    const missingConfig =
      requiredConfig.filter(
        (key) => {

          return (
            !process.env[key] ||
            !String(
              process.env[key]
            ).trim()
          );
        }
      );


    if (
      missingConfig.length > 0
    ) {

      console.error(
        "[BusBooking][BoardingDropping] Missing config:",
        missingConfig
      );


      return res
        .status(500)
        .json({

          success: false,

          message:
            "Boarding/dropping provider configuration is missing",

          missingConfig,
        });
    }


    /*
    |--------------------------------------------------------------------------
    | Prepare Provider Body
    |--------------------------------------------------------------------------
    */

    const requestBody = {
      TraceId:
        normalizedTraceId,

      ResultIndex:
        normalizedResultIndex,
    };


    /*
    |--------------------------------------------------------------------------
    | Safe Debug Log
    |--------------------------------------------------------------------------
    |
    | Don't log username/password.
    |
    |--------------------------------------------------------------------------
    */

    console.log(
      "[BusBooking][BoardingDropping] Provider Request",
      {
        TraceId:
          requestBody.TraceId,

        ResultIndex:
          requestBody.ResultIndex,
      }
    );


    /*
    |--------------------------------------------------------------------------
    | Call Provider API
    |--------------------------------------------------------------------------
    */

    const providerResponse =
      await srdvClient.post(

        process.env
          .SRDV_BOARDING_DROPPING_URL,

        requestBody,

        {
          headers: {

            "Content-Type":
              "application/json",

            "Api-Token":
              process.env
                .SRDV_API_TOKEN,
          },

          timeout:
            30000,
        }
      );


    /*
    |--------------------------------------------------------------------------
    | Provider Data
    |--------------------------------------------------------------------------
    */

    const apiData =
      providerResponse.data;


    /*
    |--------------------------------------------------------------------------
    | Check Provider Error
    |--------------------------------------------------------------------------
    */

    if (
      apiData?.Error &&
      Number(
        apiData.Error.ErrorCode
      ) !== 0
    ) {

      return res
        .status(400)
        .json({

          success: false,

          message:
            apiData.Error
              .ErrorMessage ||
            "Unable to get boarding and dropping points",

          providerError:
            apiData.Error,
        });
    }


    /*
    |--------------------------------------------------------------------------
    | Boarding Points
    |--------------------------------------------------------------------------
    */

    const boardingPoints =
      Array.isArray(
        apiData
          ?.BoardingPoints
      )
        ? apiData
            .BoardingPoints
        : [];


    /*
    |--------------------------------------------------------------------------
    | Dropping Points
    |--------------------------------------------------------------------------
    */

    const droppingPoints =
      Array.isArray(
        apiData
          ?.DroppingPoints
      )
        ? apiData
            .DroppingPoints
        : [];


    /*
    |--------------------------------------------------------------------------
    | Response To React Native
    |--------------------------------------------------------------------------
    */

    return res
      .status(200)
      .json({

        success: true,

        message:
          "Boarding and dropping points fetched successfully",


        traceId:
          apiData.TraceId ??
          normalizedTraceId,


        srdvIndex:
          apiData.SrdvIndex ??
          null,


        resultIndex:
          apiData.ResultIndex ??
          normalizedResultIndex,


        boardingPointCount:
          boardingPoints.length,


        droppingPointCount:
          droppingPoints.length,


        boardingPoints,


        droppingPoints,
      });


  } catch (error) {

    /*
    |--------------------------------------------------------------------------
    | Provider HTTP Error
    |--------------------------------------------------------------------------
    */

    if (
      error.response
    ) {

      console.error(
        "[BusBooking][BoardingDropping] Provider HTTP Error",
        {
          status:
            error.response
              .status,

          data:
            error.response
              .data,
        }
      );


      return res
        .status(
          error.response
            .status || 500
        )
        .json({

          success: false,

          message:
            error.response
              ?.data
              ?.Error
              ?.ErrorMessage ||

            error.response
              ?.data
              ?.message ||

            "Boarding/dropping provider API error",

        });
    }


    /*
    |--------------------------------------------------------------------------
    | Internal / Network Error
    |--------------------------------------------------------------------------
    */

    console.error(
      "[BusBooking][BoardingDropping] Error:",
      error.message
    );


    return res
      .status(500)
      .json({

        success: false,

        message:
          "Unable to get boarding and dropping points",

        error:
          error.message,
      });
  }
};
/*
|--------------------------------------------------------------------------
| BLOCK BUS SEAT
|--------------------------------------------------------------------------
|
| POST
| /api/busbooking/block
|
|--------------------------------------------------------------------------
*/

/*
|--------------------------------------------------------------------------
| BLOCK BUS SEAT
|--------------------------------------------------------------------------
|
| POST
| /api/busbooking/block
|
|--------------------------------------------------------------------------
*/

const blockSeat =
  async (
    req,
    res
  ) => {

    try {

      /*
      |--------------------------------------------------------------------------
      | Frontend Data
      |--------------------------------------------------------------------------
      */

      const {
        traceId,
        resultIndex,

        boardingPointId,

        droppingPointId,

        refId,

        passengers,

        sourceCity,

        destinationCity,
      } =
        req.body;


      /*
      |--------------------------------------------------------------------------
      | Logged User
      |--------------------------------------------------------------------------
      */

      const userId =
        req.user?.user_id;


      if (!userId) {

        return res
          .status(401)
          .json({

            success:
              false,

            message:
              "Unauthorized user",
          });
      }

      const validatedBlock = validateBlockRequest({
        traceId,
        resultIndex,
        boardingPointId,
        droppingPointId,
        refId,
        passengers,
      });
      if (validatedBlock.error) {
        return res.status(400).json({
          success: false,
          message: validatedBlock.error,
        });
      }
      const normalizedPassengers = validatedBlock.value.Passengers;


      /*
      |--------------------------------------------------------------------------
      | Validation
      |--------------------------------------------------------------------------
      */

      if (
        !traceId
      ) {

        return res
          .status(400)
          .json({

            success:
              false,

            message:
              "traceId is required",
          });
      }


      if (
        !resultIndex
      ) {

        return res
          .status(400)
          .json({

            success:
              false,

            message:
              "resultIndex is required",
          });
      }


      if (
        !boardingPointId
      ) {

        return res
          .status(400)
          .json({

            success:
              false,

            message:
              "boardingPointId is required",
          });
      }


      if (
        !droppingPointId
      ) {

        return res
          .status(400)
          .json({

            success:
              false,

            message:
              "droppingPointId is required",
          });
      }


      if (
        !refId
      ) {

        return res
          .status(400)
          .json({

            success:
              false,

            message:
              "refId is required",
          });
      }


      if (
        !Array.isArray(
          passengers
        ) ||
        passengers.length ===
          0
      ) {

        return res
          .status(400)
          .json({

            success:
              false,

            message:
              "Passengers are required",
          });
      }


      /*
      |--------------------------------------------------------------------------
      | Normalize Passenger Contact Data
      |--------------------------------------------------------------------------
      |
      | Passenger Email is optional.
      |
      | If frontend sends a top-level email, reuse it for passengers that do not
      | include their own Email field.
      |
      |--------------------------------------------------------------------------
      */

      /*
      |--------------------------------------------------------------------------
      | Required Provider Config
      |--------------------------------------------------------------------------
      */

      const requiredConfig = [

        "SRDV_BLOCK_URL",

        "SRDV_API_TOKEN",




      ];


      const missingConfig =
        requiredConfig.filter(
          key =>
            !process.env[key] ||
            !String(
              process.env[key]
            ).trim()
        );


      if (
        missingConfig.length >
        0
      ) {

        return res
          .status(500)
          .json({

            success:
              false,

            message:
              "Block API provider configuration is missing",

            missingConfig,
          });
      }


      /*
      |--------------------------------------------------------------------------
      | Provider Request
      |--------------------------------------------------------------------------
      */

      const requestBody = {
        TraceId:
          validatedBlock.value.TraceId,

        ResultIndex:
          validatedBlock.value.ResultIndex,

        BoardingPointId:
          validatedBlock.value.BoardingPointId,

        DroppingPointId:
          validatedBlock.value.DroppingPointId,

        RefId:
          validatedBlock.value.RefId,

        Passengers:
          normalizedPassengers,
      };


      console.log(
        "[BusBooking][Block] Provider Request",
        {

          TraceId:
            requestBody.TraceId,

          ResultIndex:
            requestBody.ResultIndex,

          BoardingPointId:
            requestBody.BoardingPointId,

          DroppingPointId:
            requestBody.DroppingPointId,

          RefId:
            requestBody.RefId,

          passengerCount:
            normalizedPassengers.length,
        }
      );


      /*
      |--------------------------------------------------------------------------
      | Call Provider
      |--------------------------------------------------------------------------
      */

      const providerResponse =
        await srdvClient.post(

          process.env
            .SRDV_BLOCK_URL,

          requestBody,

          {

            headers: {

              "Content-Type":
                "application/json",

              "Api-Token":
                process.env
                  .SRDV_API_TOKEN,
            },

            timeout:
              30000,
          }
        );


      const apiData =
        providerResponse.data;


      /*
      |--------------------------------------------------------------------------
      | Provider Error
      |--------------------------------------------------------------------------
      */

      const providerErrorCode =
        Number(
          apiData
            ?.Error
            ?.ErrorCode ??
          0
        );


      if (
        providerErrorCode !==
        0
      ) {

        return res
          .status(400)
          .json({

            success:
              false,

            message:
              apiData
                ?.Error
                ?.ErrorMessage ||
              "Unable to block bus seat",

            providerError:
              apiData?.Error || null,

          });
      }


      /*
      |--------------------------------------------------------------------------
      | Block Key
      |--------------------------------------------------------------------------
      */

      const blockKey =
        String(
          apiData
            ?.BlockKey ||
          ""
        );


      if (
        !blockKey
      ) {

        return res
          .status(400)
          .json({

            success:
              false,

            message:
              "Provider did not return BlockKey",
          });
      }


      /*
      |--------------------------------------------------------------------------
      | Calculate Provider Fare
      |--------------------------------------------------------------------------
      */

      const providerPassengers =
        Array.isArray(
          apiData?.Passengers
        )
          ? apiData.Passengers
          : [];


      let totalAmount =
        providerPassengers.reduce(
          (
            total,
            passenger
          ) => {

            const publishedFare =
              Number(
                passenger
                  ?.Seat
                  ?.Price
                  ?.PublishedFare ||
                0
              );


            const offeredFare =
              Number(
                passenger
                  ?.Seat
                  ?.Price
                  ?.OfferedFare ||
                0
              );


            const seatFare =
              Number(
                passenger
                  ?.Seat
                  ?.SeatFare ||
                0
              );


            const amount =
              publishedFare ||
              offeredFare ||
              seatFare;


            return (
              total +
              amount
            );
          },

          0
        );


      /*
      |--------------------------------------------------------------------------
      | Fallback From Provider Price
      |--------------------------------------------------------------------------
      */

      if (
        totalAmount <= 0
      ) {

        const providerPrice =
          apiData?.Price;


        if (
          typeof providerPrice ===
          "number"
        ) {

          totalAmount =
            providerPrice *
            passengers.length;

        } else if (
          providerPrice &&
          typeof providerPrice ===
            "object"
        ) {

          const publishedFare =
            Number(
              providerPrice
                ?.PublishedFare ||
              0
            );


          const offeredFare =
            Number(
              providerPrice
                ?.OfferedFare ||
              0
            );


          totalAmount =
            (
              publishedFare ||
              offeredFare
            ) *
            passengers.length;
        }
      }


      if (
        !Number.isFinite(
          totalAmount
        ) ||
        totalAmount <= 0
      ) {

        console.error(
          "[BusBooking][Block] Could not calculate provider amount",
          { traceId }
        );


        return res
          .status(400)
          .json({

            success:
              false,

            message:
              "Unable to calculate booking amount from provider response",
          });
      }


      totalAmount =
        Number(
          totalAmount.toFixed(
            2
          )
        );


      /*
      |--------------------------------------------------------------------------
      | Trip Information
      |--------------------------------------------------------------------------
      */

      const departureTime =
        apiData
          ?.DepartureTime ||
        null;


      const arrivalTime =
        apiData
          ?.ArrivalTime ||
        null;


      const journeyDate =
        departureTime
          ? String(
              departureTime
            ).slice(
              0,
              10
            )
          : null;


      /*
      |--------------------------------------------------------------------------
      | Save Local Order + Passengers
      |--------------------------------------------------------------------------
      */

      let connection;


      try {

        connection =
          await db
            .getConnection();


        await connection
          .beginTransaction();


        const localOrder =
          await BusBookingOrderModel
            .create(
              {

                user_id:
                  userId,

                trace_id:
                  String(
                    apiData
                      ?.TraceId ??
                    validatedBlock.value.TraceId
                  ),

                srdv_index:
                  apiData?.SrdvIndex == null
                    ? null
                    : String(apiData.SrdvIndex),

                result_index:
                  String(
                    apiData
                      ?.ResultIndex ??
                    validatedBlock.value.ResultIndex
                  ),

                block_key:
                  blockKey,

                operator_name:
                  apiData
                    ?.TravelsName ||
                  null,

                bus_type:
                  apiData
                    ?.BusType ||
                  null,

                source_city:
                  sourceCity ||
                  null,

                destination_city:
                  destinationCity ||
                  null,

                journey_date:
                  journeyDate,

                departure_time:
                  departureTime,

                arrival_time:
                  arrivalTime,

                boarding_point_id:
                  String(
                    apiData
                      ?.BoardingPointdetails
                      ?.Id ||
                    validatedBlock.value.BoardingPointId
                  ),

                boarding_point_name:
                  apiData
                    ?.BoardingPointdetails
                    ?.Name ||
                  null,

                dropping_point_id:
                  String(
                    apiData
                      ?.DroppingPointsDetails
                      ?.Id ||
                    validatedBlock.value.DroppingPointId
                  ),

                dropping_point_name:
                  apiData
                    ?.DroppingPointsDetails
                    ?.Name ||
                  null,

                seat_count:
                  normalizedPassengers.length,

                total_amount:
                  totalAmount,

                reward_coins_earned:
                  0,

                reward_coins_used:
                  0,

                status:
                  "pending_payment",

                payment_status:
                  "pending",

                raw_block_response:
                  apiData,
              },

              connection
            );


        await BusBookingOrderModel
          .createPassengers(
            localOrder.id,
            normalizedPassengers,
            connection
          );


        await connection
          .commit();


        /*
        |--------------------------------------------------------------------------
        | Success
        |--------------------------------------------------------------------------
        */

        return res
          .status(200)
          .json({

            success:
              true,

            message:
              "Seat blocked successfully",

            traceId:
              String(
                apiData
                  ?.TraceId ??
                validatedBlock.value.TraceId
              ),

            srdvIndex:
              apiData?.SrdvIndex == null
                ? null
                : String(apiData.SrdvIndex),

            resultIndex:
              String(
                apiData
                  ?.ResultIndex ??
                validatedBlock.value.ResultIndex
              ),

            blockKey,

            /*
            |--------------------------------------------------------------------------
            | Local Order
            |--------------------------------------------------------------------------
            */

            localOrderId:
              localOrder.id,

            orderRef:
              localOrder
                .order_ref,

            payableAmount:
              totalAmount,

            /*
            |--------------------------------------------------------------------------
            | Provider Data
            |--------------------------------------------------------------------------
            */

            bus: {

              travelsName:
                apiData
                  ?.TravelsName ||
                null,

              busType:
                apiData
                  ?.BusType ||
                null,

              departureTime,

              arrivalTime,

              duration:
                apiData
                  ?.Duration ??
                null,

              price:
                apiData
                  ?.Price ||
                null,
            },

            boardingPoint:
              apiData
                ?.BoardingPointdetails ||
              null,

            droppingPoint:
              apiData
                ?.DroppingPointsDetails ||
              null,

            cancellationPolicy:
              apiData
                ?.CancellationPolicy ||
              [],

              passengers:
                apiData
                  ?.Passengers ||
              normalizedPassengers,
          });


      } catch (
        dbError
      ) {

        if (
          connection
        ) {

          await connection
            .rollback();
        }


        console.error(
          "[BusBooking][Block] Local order save failed",
          dbError
        );


        return res
          .status(500)
          .json({

            success:
              false,

            message:
              "Seat blocked but local booking order could not be saved",

          });


      } finally {

        if (
          connection
        ) {

          connection.release();
        }
      }


    } catch (
      error
    ) {

      console.error(
        "[BusBooking][Block] Error",
        error.message
      );


      if (
        error.response
      ) {

        return res
          .status(
            error.response
              .status ||
            500
          )
          .json({

            success:
              false,

            message:
              error.response
                ?.data
                ?.Error
                ?.ErrorMessage ||

              error.response
                ?.data
                ?.message ||

              "Block provider API error",

        });
      }


      return res
        .status(500)
        .json({

          success:
            false,

          message:
            "Unable to block selected seat",
        });
    }
  };
/*
|--------------------------------------------------------------------------
| BOOK BUS TICKET
|--------------------------------------------------------------------------
|
| POST /api/busbooking/book
|
| Frontend sends:
|
| {
|   traceId,
|   srdvIndex,
|   resultIndex
| }
|
|--------------------------------------------------------------------------
*/
/*
|--------------------------------------------------------------------------
| Create Razorpay Order For Bus Booking
|--------------------------------------------------------------------------
*/

/*
|--------------------------------------------------------------------------
| CREATE RAZORPAY ORDER
|--------------------------------------------------------------------------
|
| POST
| /api/busbooking/create-order
|
| Frontend sends:
|
| {
|   "order_ref": "BB-ORD-1001"
| }
|
|--------------------------------------------------------------------------
*/

const createPaymentOrder =
  async (
    req,
    res
  ) => {

    let connection;


    try {

      /*
      |--------------------------------------------------------------------------
      | User
      |--------------------------------------------------------------------------
      */

      const userId =
        req.user?.user_id ||
        null;


      /*
      |--------------------------------------------------------------------------
      | Request
      |--------------------------------------------------------------------------
      */

      const {
        order_ref,
      } =
        req.body;


      if (
        !order_ref ||
        !String(
          order_ref
        ).trim()
      ) {

        return res
          .status(400)
          .json({

            success:
              false,

            message:
              "order_ref required",
          });
      }


      const cleanOrderRef =
        String(
          order_ref
        ).trim();


      /*
      |--------------------------------------------------------------------------
      | Transaction
      |--------------------------------------------------------------------------
      */

      connection =
        await db
          .getConnection();


      await connection
        .beginTransaction();


      /*
      |--------------------------------------------------------------------------
      | Lock Bus Booking Order
      |--------------------------------------------------------------------------
      */

      const [
        orders
      ] =
        await connection
          .execute(
            `
            SELECT

              id,

              order_ref,

              total_amount,

              reward_coins_used,

              status,

              payment_status,

              TIMESTAMPDIFF(SECOND, created_at, NOW()) AS age_seconds

            FROM busbooking_orders

            WHERE order_ref = ?
              AND user_id = ?

            LIMIT 1

            FOR UPDATE
            `,
            [
              cleanOrderRef,
              userId,
            ]
          );


      if (
        !orders.length
      ) {

        await connection
          .rollback();


        return res
          .status(400)
          .json({

            success:
              false,

            message:
              "Invalid order_ref",
          });
      }


      const order =
        orders[0];


      /*
      |--------------------------------------------------------------------------
      | Payment State
      |--------------------------------------------------------------------------
      */

      if (
        String(
          order.payment_status
        ).toLowerCase() ===
          "paid" ||

        order.status !==
          "pending_payment"
      ) {

        await connection
          .rollback();


        return res
          .status(400)
          .json({

            success:
              false,

            message:
              "Order is not payable",
          });
      }


      /*
      |--------------------------------------------------------------------------
      | Seat Hold Still Valid
      |--------------------------------------------------------------------------
      |
      | The provider only holds blocked seats for a short time. Taking money
      | after that would charge the customer for seats that are gone.
      |
      |--------------------------------------------------------------------------
      */

      if (
        isBlockExpired(
          order.age_seconds,
          getBlockTtlMinutes()
        )
      ) {

        await connection
          .execute(
            `
            UPDATE busbooking_orders
            SET status = 'expired'
            WHERE id = ?
            `,
            [
              order.id,
            ]
          );

        await connection
          .commit();


        return res
          .status(410)
          .json({

            success:
              false,

            code:
              "SEAT_HOLD_EXPIRED",

            message:
              "Your seat hold has expired. Please select your seats again.",
          });
      }


      /*
      |--------------------------------------------------------------------------
      | Server Side Amount
      |--------------------------------------------------------------------------
      */

      const totalAmount =
        Math.max(

          0,

          Number(
            order.total_amount ||
            0
          ) -

          Number(
            order.reward_coins_used ||
            0
          )
        );


      if (
        !Number.isFinite(
          totalAmount
        ) ||
        totalAmount <= 0
      ) {

        await connection
          .rollback();


        return res
          .status(400)
          .json({

            success:
              false,

            message:
              "Invalid order amount",
          });
      }


      /*
      |--------------------------------------------------------------------------
      | Existing Razorpay Order
      |--------------------------------------------------------------------------
      */

      const [
        existingRows
      ] =
        await connection
          .execute(
            `
            SELECT

              id,

              razorpay_order_id,

              amount,

              status

            FROM razorpay_orders

            WHERE ref_id = ?
              AND module = 'busbooking'
              AND status IN (
                'created',
                'pending'
              )

            ORDER BY id DESC

            LIMIT 1
            `,
            [
              cleanOrderRef,
            ]
          );


      const existingPaymentOrder =
        existingRows[0];


      if (
        existingPaymentOrder
      ) {

        await connection
          .commit();


        return res
          .status(200)
          .json({

            success:
              true,

            reused:
              true,

            message:
              "Existing Razorpay order returned",

            data: {

              key:
                process.env
                  .RAZOR_API_KEY,

              orderId:
                existingPaymentOrder
                  .razorpay_order_id,

              amount:
                Math.round(
                  Number(
                    existingPaymentOrder
                      .amount
                  ) *
                  100
                ),

              currency:
                "INR",

              order_ref:
                cleanOrderRef,
            },
          });
      }


      /*
      |--------------------------------------------------------------------------
      | Create Razorpay Order
      |--------------------------------------------------------------------------
      */

      const razorpayOrder =
        await razorpay
          .orders
          .create({

            amount:
              Math.round(
                totalAmount *
                100
              ),

            currency:
              "INR",

            receipt:
              cleanOrderRef,

            notes: {

              module:
                "busbooking",

              order_ref:
                cleanOrderRef,

              user_id:
                String(
                  userId
                ),
            },
          });


      console.log(
        "[BusBooking][CreatePaymentOrder] Razorpay created",
        {

          orderId:
            razorpayOrder.id,

          orderRef:
            cleanOrderRef,

          amount:
            totalAmount,
        }
      );


      /*
      |--------------------------------------------------------------------------
      | Save In Shared Razorpay Table
      |--------------------------------------------------------------------------
      */

      await connection
        .execute(
          `
          INSERT INTO razorpay_orders
          (
            razorpay_order_id,

            order_source,

            receipt,

            amount,

            status,

            ref_id,

            module,

            raw_response
          )
          VALUES
          (
            ?, ?, ?, ?,
            'created',
            ?,
            'busbooking',
            ?
          )
          `,
          [
            razorpayOrder.id,

            "internal",

            cleanOrderRef,

            totalAmount,

            cleanOrderRef,

            JSON.stringify(
              razorpayOrder
            ),
          ]
        );


      await connection
        .commit();


      /*
      |--------------------------------------------------------------------------
      | Response
      |--------------------------------------------------------------------------
      */

      return res
        .status(200)
        .json({

          success:
            true,

          reused:
            false,

          message:
            "Razorpay order created successfully",

          data: {

            key:
              process.env
                .RAZOR_API_KEY,

            orderId:
              razorpayOrder.id,

            amount:
              Number(
                razorpayOrder.amount
              ),

            currency:
              razorpayOrder.currency ||
              "INR",

            order_ref:
              cleanOrderRef,
          },
        });


    } catch (
      error
    ) {

      if (
        connection
      ) {

        try {

          await connection
            .rollback();

        } catch (
          rollbackError
        ) {

          console.error(
            "[BusBooking][CreatePaymentOrder] Rollback Error",
            rollbackError
          );
        }
      }


      console.error(
        "[BusBooking][CreatePaymentOrder] Error",
        error
      );


      return res
        .status(500)
        .json({

          success:
            false,

          message:
            error?.error
              ?.description ||

            error?.message ||

            "Unable to create Razorpay order",
        });


    } finally {

      if (
        connection
      ) {

        connection
          .release();
      }
    }
  };


const verifyPayment =
  async (
    req,
    res
  ) => {

    let connection;


    try {

      const userId =
        req.user.user_id;

      const {
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
      } =
        req.body;


      if (
        !razorpay_order_id ||
        !razorpay_payment_id ||
        !razorpay_signature
      ) {

        return res
          .status(400)
          .json({

            success:
              false,

            message:
              "Missing payment details",
          });
      }


      const body =
        `${razorpay_order_id}|${razorpay_payment_id}`;


      const expectedSignature =
        crypto
          .createHmac(
            "sha256",
            process.env
              .RAZOR_SECRET_KEY
          )
          .update(
            body
          )
          .digest(
            "hex"
          );


      const expectedBuffer =
        Buffer.from(
          expectedSignature,
          "hex"
        );

      const receivedBuffer =
        Buffer.from(
          razorpay_signature,
          "hex"
        );


      if (
        expectedBuffer.length !==
          receivedBuffer.length ||
        !crypto.timingSafeEqual(
          expectedBuffer,
          receivedBuffer
        )
      ) {

        return res
          .status(400)
          .json({

            success:
              false,

            message:
              "Payment verification failed",
          });
      }


      const [
        rpRows
      ] =
        await db.execute(
          `
          SELECT
            rp.ref_id,
            rp.module,
            rp.amount,
            rp.status,
            rp.razorpay_payment_id
          FROM razorpay_orders rp
          JOIN busbooking_orders bo
            ON bo.order_ref = rp.ref_id
          WHERE rp.razorpay_order_id = ?
            AND rp.module = 'busbooking'
            AND bo.user_id = ?
          LIMIT 1
          `,
          [
            razorpay_order_id,
            userId,
          ]
        );


      const rpOrder =
        rpRows[0];


      if (
        !rpOrder ||
        rpOrder.module !==
          "busbooking"
      ) {

        return res
          .status(400)
          .json({

            success:
              false,

            message:
              "Invalid razorpay order",
          });
      }


      const providerPayment =
        await razorpay.payments.fetch(
          razorpay_payment_id
        );

      const expectedAmountPaise =
        Math.round(
          Number(rpOrder.amount) * 100
        );

      if (!isExpectedCapturedPayment(providerPayment, {
        orderId: razorpay_order_id,
        amountPaise: expectedAmountPaise,
      })) {
        return res.status(400).json({
          success: false,
          message: "Payment has not been captured for the expected order amount",
        });
      }


      const orderRef =
        String(
          rpOrder.ref_id ||
          ""
        ).trim();

      if (rpOrder.status === "success") {
        if (rpOrder.razorpay_payment_id !== razorpay_payment_id) {
          return res.status(409).json({
            success: false,
            message: "Payment order was already completed with another payment",
          });
        }

        return res.status(200).json({
          success: true,
          reused: true,
          message: "Payment already verified",
          data: {
            order_ref: orderRef,
            razorpay_order_id,
            razorpay_payment_id,
          },
        });
      }


      const [
        orderRows
      ] =
        await db.execute(
          `
          SELECT
            id,
            order_ref,
            payment_status,
            status,
            user_id
          FROM busbooking_orders
          WHERE order_ref = ?
            AND user_id = ?
          LIMIT 1
          `,
          [
            orderRef,
            userId,
          ]
        );


      const busOrder =
        orderRows[0];


      if (
        !busOrder
      ) {

        return res
          .status(404)
          .json({

            success:
              false,

            message:
              "Order not found",
          });
      }


      connection =
        await db
          .getConnection();

      await connection
        .beginTransaction();


      const [
        lockedRows
      ] =
        await connection.execute(
          `
          SELECT
            id,
            order_ref,
            payment_status,
            status
          FROM busbooking_orders
          WHERE order_ref = ?
            AND user_id = ?
          LIMIT 1
          FOR UPDATE
          `,
          [
            orderRef,
            userId,
          ]
        );


      const lockedOrder =
        lockedRows[0];


      if (
        !lockedOrder
      ) {

        await connection
          .rollback();

        return res
          .status(404)
          .json({

            success:
              false,

            message:
              "Order not found",
          });
      }


      if (
        String(
          lockedOrder
            .payment_status ||
          ""
        ).toLowerCase() !==
        "paid"
      ) {

await connection
    .execute(
        `
        UPDATE busbooking_orders
        SET
            payment_status = 'paid',
            status = 'payment_success'
        WHERE id = ?
        `,
        [
            lockedOrder.id,
        ]
    );
      }


await connection
    .execute(
        `
        UPDATE razorpay_orders
        SET
            razorpay_payment_id = ?,
            raw_response = ?,
            status = 'success'
        WHERE razorpay_order_id = ?
          AND module = 'busbooking'
        `,
        [
            razorpay_payment_id,

            JSON.stringify(
                {
                  id: providerPayment.id,
                  order_id: providerPayment.order_id,
                  amount: providerPayment.amount,
                  currency: providerPayment.currency,
                  status: providerPayment.status,
                }
            ),

            razorpay_order_id,
        ]
    );


      await connection
        .commit();


      return res
        .status(200)
        .json({

          success:
            true,

          message:
            "Payment successful",

          data: {
            order_ref:
              orderRef,
            razorpay_order_id,
            razorpay_payment_id,
          },
        });

    } catch (
      error
    ) {

      if (
        connection
      ) {

        try {

          await connection
            .rollback();

        } catch (
          rollbackError
        ) {

          console.error(
            "[BusBooking][VerifyPayment] Rollback Error",
            rollbackError
          );
        }
      }


      console.error(
        "[BusBooking][VerifyPayment] Error",
        error
      );


      return res
        .status(500)
        .json({

          success:
            false,

          message:
            "Unable to verify payment",
        });
    } finally {

      if (
        connection
      ) {

        connection
          .release();
      }
    }
  };


/*
|--------------------------------------------------------------------------
| BOOK BUS TICKET
|--------------------------------------------------------------------------
|
| POST /api/busbooking/book   { "order_ref": "BB-ORD-1001" }
|
| The provider call itself lives in bookingService so the app, the cron and
| a retry all go through the same single-attempt path. This handler only
| reports where the order ended up.
|
|--------------------------------------------------------------------------
*/

const bookBusTicket = async (req, res) => {
  const orderRef = String(req.body?.order_ref || "").trim();

  if (!orderRef) {
    return res.status(400).json({
      success: false,
      message: "order_ref is required",
    });
  }

  try {
    const existing = await BusBookingOrderModel.findByOrderRef(
      orderRef,
      req.user.user_id,
    );

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Booking order not found",
      });
    }

    let result = await bookOrder(existing.id);
    if (result.decision === "in_progress") {
      result = await waitForBookingResult(existing.id);
    }

    const { decision, order } = result;

    if (decision === "already_confirmed") {
      return res.status(200).json({
        success: true,
        reused: !result.attempted,
        message: result.attempted
          ? "Bus ticket booked successfully"
          : "Bus ticket already booked",
        orderRef: order.order_ref,
        traceId: String(order.trace_id),
        srdvIndex: String(order.srdv_index),
        resultIndex: String(order.result_index),
        bookingId: order.provider_booking_id,
        bookingStatus: "Success",
        ticketNo: order.ticket_no,
        travelOperatorPNR: order.travel_operator_pnr,
      });
    }

    if (decision === "failed") {
      return res.status(400).json({
        success: false,
        code: "BOOKING_FAILED",
        message:
          "Bus booking could not be completed. Your payment will be refunded to the original payment method.",
        orderRef: order.order_ref,
        refundInitiated: true,
      });
    }

    if (decision === "in_progress" || decision === "under_review") {
      return res.status(202).json({
        success: false,
        pending: true,
        code: "BOOKING_PENDING",
        message:
          "Your payment is safe. We are confirming your ticket with the operator.",
        orderRef: order.order_ref,
      });
    }

    return res.status(409).json({
      success: false,
      message: "A captured payment is required before booking",
    });
  } catch (error) {
    console.error("[BusBooking][Book] Error", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to book bus ticket",
    });
  }
};


const getProviderBookingDetails = async (req, res) => {
  const orderRef = String(req.body?.order_ref || "").trim();
  const requestedCancelId = String(
    req.body?.cancel_id ?? req.body?.cancelId ?? "",
  ).trim();
  if (!orderRef) {
    return res.status(400).json({
      success: false,
      message: "order_ref is required",
    });
  }

  const requiredConfig = [
    "SRDV_BOOKING_DETAILS_URL",
    "SRDV_API_TOKEN",
  ];
  const missingConfig = requiredConfig.filter(
    (key) => !String(process.env[key] || "").trim(),
  );
  if (missingConfig.length) {
    return res.status(500).json({
      success: false,
      message: "Booking details provider configuration is missing",
      missingConfig,
    });
  }

  try {
    const [[order]] = await db.execute(
      `SELECT id, trace_id
         FROM busbooking_orders
        WHERE order_ref = ? AND user_id = ?
        LIMIT 1`,
      [orderRef, req.user.user_id],
    );

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Booking order not found",
      });
    }

    const traceId = parsePositiveInteger(order.trace_id);
    if (!traceId) {
      console.error("[BusBooking][BookingDetails] Invalid stored TraceId", {
        orderRef,
      });
      return res.status(500).json({
        success: false,
        message: "Booking has an invalid provider reference",
      });
    }

    const providerResponse = await srdvClient.post(
      process.env.SRDV_BOOKING_DETAILS_URL,
      { TraceId: traceId },
      {
        headers: {
          "Content-Type": "application/json",
          "Api-Token": process.env.SRDV_API_TOKEN,
        },
        timeout: 30000,
      },
    );
    const apiData = providerResponse.data;
    const providerErrorCode = Number(apiData?.Error?.ErrorCode ?? 0);

    if (providerErrorCode !== 0) {
      return res.status(400).json({
        success: false,
        message:
          String(apiData?.Error?.ErrorMessage || "").trim() ||
          "Unable to get booking details",
        providerError: apiData?.Error || null,
      });
    }

    const bookingDetails = apiData?.Result ?? null;
    if (bookingDetails) {
      await reconcileProviderCancellations(order.id, bookingDetails);
    }
    const cancellations = Array.isArray(bookingDetails?.Cancellations)
      ? bookingDetails.Cancellations
      : [];
    const cancellation = requestedCancelId
      ? cancellations.find(
          (entry) => String(entry?.CancelId ?? "") === requestedCancelId,
        ) || null
      : null;

    if (requestedCancelId && !cancellation) {
      return res.status(404).json({
        success: false,
        message: "Cancellation request was not found in provider booking details",
        orderRef,
        traceId: apiData?.TraceId ?? traceId,
        cancelId: requestedCancelId,
      });
    }

    const cancellationStatus = String(cancellation?.Status || "").toUpperCase();
    const refundStatus = String(cancellation?.RefundStatus || "").toUpperCase();
    const cancellationTerminal = cancellation
      ? cancellationStatus === "FAILED" ||
        (
          cancellationStatus === "CANCELLED" &&
          ["REFUNDED", "REJECTED"].includes(refundStatus)
        )
      : null;

    return res.status(200).json({
      success: true,
      message: "Booking details fetched successfully",
      orderRef,
      traceId: apiData?.TraceId ?? traceId,
      bookingDetails,
      ...(requestedCancelId
        ? {
            cancellation,
            cancellationTerminal,
            shouldPollCancellation: !cancellationTerminal,
          }
        : {}),
    });
  } catch (error) {
    console.error("[BusBooking][BookingDetails] Error", error.message);
    return res.status(error.response ? 502 : 500).json({
      success: false,
      message:
        String(error.response?.data?.Error?.ErrorMessage || "").trim() ||
        "Unable to get booking details",
    });
  }
};

const getProviderBalance = async (req, res) => {
  const requiredConfig = [
    "SRDV_BALANCE_URL",
    "SRDV_API_TOKEN",
  ];
  const missingConfig = requiredConfig.filter(
    (key) => !String(process.env[key] || "").trim(),
  );

  if (missingConfig.length) {
    console.error("[BusBooking][Balance] Missing configuration", missingConfig);
    return res.status(500).json({
      success: false,
      message: "Balance provider configuration is missing",
    });
  }

  try {
    const providerResponse = await srdvClient.post(
      process.env.SRDV_BALANCE_URL,
      {},
      {
        headers: {
          "Api-Token": process.env.SRDV_API_TOKEN,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      },
    );

    const apiData = providerResponse.data;
    const providerErrorCode = Number(apiData?.Error?.ErrorCode ?? 0);
    const providerErrorMessage = String(apiData?.Error?.ErrorMessage || "");

    if (providerErrorCode !== 0) {
      return res.status(400).json({
        success: false,
        message: providerErrorMessage || "Unable to fetch provider balance",
        errorCode: providerErrorCode,
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        availableBalance: apiData?.AvailableBalance ?? null,
        balance: apiData?.Balance ?? null,
        creditLimit: apiData?.CreditLimit ?? null,
      },
    });
  } catch (error) {
    console.error("[BusBooking][Balance] Error", error.message);
    return res.status(error.response ? 502 : 500).json({
      success: false,
      message:
        String(error.response?.data?.Error?.ErrorMessage || "").trim() ||
        "Unable to fetch provider balance",
    });
  }
};

const getProviderBalanceLog = async (req, res) => {
  const requiredConfig = [
    "SRDV_BALANCE_LOG_URL",
    "SRDV_API_TOKEN",
  ];
  const missingConfig = requiredConfig.filter(
    (key) => !String(process.env[key] || "").trim(),
  );

  if (missingConfig.length) {
    console.error("[BusBooking][BalanceLog] Missing configuration", missingConfig);
    return res.status(500).json({
      success: false,
      message: "Balance log provider configuration is missing",
    });
  }

  try {
    const providerResponse = await srdvClient.post(
      process.env.SRDV_BALANCE_LOG_URL,
      {},
      {
        headers: {
          "Api-Token": process.env.SRDV_API_TOKEN,
          "Content-Type": "application/json",
        },
        timeout: 30000,
      },
    );

    const apiData = providerResponse.data;
    const providerErrorCode = Number(apiData?.Error?.ErrorCode ?? 0);
    const providerErrorMessage = String(apiData?.Error?.ErrorMessage || "");

    if (providerErrorCode !== 0) {
      return res.status(400).json({
        success: false,
        message: providerErrorMessage || "Unable to fetch provider balance log",
        errorCode: providerErrorCode,
      });
    }

    const entries = Array.isArray(apiData?.Result) ? apiData.Result : [];
    return res.status(200).json({
      success: true,
      data: entries.map((entry) => ({
        id: entry?.ID ?? null,
        date: entry?.Date ?? null,
        clientId: entry?.ClientID ?? null,
        clientName: entry?.ClientName ?? null,
        detail: entry?.Detail ?? null,
        debit: entry?.Debit ?? null,
        credit: entry?.Credit ?? null,
        balance: entry?.Balance ?? null,
        module: entry?.Module ?? null,
        traceId: entry?.TraceID ?? null,
        refId: entry?.RefID ?? null,
        updatedBy: entry?.UpdatedBy ?? null,
      })),
    });
  } catch (error) {
    console.error("[BusBooking][BalanceLog] Error", error.message);
    return res.status(error.response ? 502 : 500).json({
      success: false,
      message:
        String(error.response?.data?.Error?.ErrorMessage || "").trim() ||
        "Unable to fetch provider balance log",
    });
  }
};

const cancelBusTicketLegacy = async (req, res) => {
  const userId = req.user.user_id;
  const orderRef = String(req.body?.order_ref || "").trim();
  const seatName = String(req.body?.seatName || "").trim();
  const remarks = String(req.body?.remarks || "").trim();

  if (!orderRef || !seatName || !remarks) {
    return res.status(400).json({
      success: false,
      message: "order_ref, seatName and remarks are required",
    });
  }

  if (remarks.length > 500) {
    return res.status(400).json({
      success: false,
      message: "remarks must not exceed 500 characters",
    });
  }

  const requiredConfig = [
    "SRDV_CANCEL_URL",
    "SRDV_API_TOKEN",
  ];
  const missingConfig = requiredConfig.filter(
    (key) => !String(process.env[key] || "").trim(),
  );
  if (missingConfig.length) {
    console.error("[BusBooking][Cancel] Missing configuration", missingConfig);
    return res.status(500).json({
      success: false,
      message: "Cancellation provider configuration is missing",
    });
  }

  let connection;
  let cancellationId;
  let order;
  // Once the provider has been asked, the seat may be cancelled whatever
  // happens next, so the request must never be written off as "failed".
  let providerCalled = false;

  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    const [orderRows] = await connection.execute(
      `SELECT id, user_id, order_ref, trace_id, seat_count, total_amount,
              reward_coins_used, status, payment_status
         FROM busbooking_orders
        WHERE order_ref = ? AND user_id = ?
        LIMIT 1
        FOR UPDATE`,
      [orderRef, userId],
    );
    order = orderRows[0];

    if (!order) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Booking order not found" });
    }

    if (order.status !== "confirmed" || order.payment_status !== "paid") {
      await connection.rollback();
      return res.status(409).json({
        success: false,
        message: "Only a confirmed paid booking can be cancelled",
      });
    }

    const [[passenger]] = await connection.execute(
      `SELECT id
         FROM busbooking_passengers
        WHERE busbooking_order_id = ? AND seat_name = ?
        LIMIT 1`,
      [order.id, seatName],
    );
    if (!passenger) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: "Seat does not belong to this booking",
      });
    }

    const [[existing]] = await connection.execute(
      `SELECT id, status, refund_status, refund_amount
         FROM busbooking_cancellations
        WHERE busbooking_order_id = ? AND seat_name = ?
        LIMIT 1
        FOR UPDATE`,
      [order.id, seatName],
    );

    if (existing?.status === "succeeded") {
      await connection.commit();
      return res.status(200).json({
        success: true,
        reused: true,
        message: "Seat was already cancelled",
        data: {
          order_ref: orderRef,
          seatName,
          refundAmount: Number(existing.refund_amount),
          refundStatus: existing.refund_status,
        },
      });
    }

    if (existing?.status === "processing") {
      await connection.rollback();
      return res.status(409).json({
        success: false,
        message: "Cancellation is already being processed",
      });
    }

    if (existing) {
      cancellationId = existing.id;
      await connection.execute(
        `UPDATE busbooking_cancellations
            SET remarks = ?, status = 'processing',
                provider_error_code = NULL, provider_error_message = NULL
          WHERE id = ?`,
        [remarks, cancellationId],
      );
    } else {
      const [insertResult] = await connection.execute(
        `INSERT INTO busbooking_cancellations
          (busbooking_order_id, user_id, seat_name, remarks, status)
         VALUES (?, ?, ?, ?, 'processing')`,
        [order.id, userId, seatName, remarks],
      );
      cancellationId = insertResult.insertId;
    }

    await connection.commit();
    connection.release();
    connection = null;

    let apiData;
    providerCalled = true;
    try {
      const providerResponse = await srdvClient.post(
        process.env.SRDV_CANCEL_URL,
        {
          TraceId: String(order.trace_id),
          SeatName: seatName,
          Remark: remarks,
        },
        {
          headers: {
            "Api-Token": process.env.SRDV_API_TOKEN,
            "Content-Type": "application/json",
          },
          timeout: 30000,
        },
      );
      apiData = providerResponse.data;
    } catch (providerError) {
      console.error("[BusBooking][Cancel] Provider request failed", providerError.message);

      if (!isAmbiguousProviderError(providerError)) {
        await db.execute(
          `UPDATE busbooking_cancellations
              SET status = 'failed', provider_error_message = ?
            WHERE id = ?`,
          [
            `Provider rejected the cancel request (HTTP ${providerError.response.status})`,
            cancellationId,
          ],
        );
        return res.status(502).json({
          success: false,
          message: "Unable to cancel bus seat",
        });
      }

      await db.execute(
        `UPDATE busbooking_cancellations
            SET provider_error_message = ?
          WHERE id = ?`,
        ["Cancel request outcome is unknown", cancellationId],
      );
      await sendOpsAlert({
        level: "critical",
        category: "busbooking_review",
        message: `Bus cancellation for ${orderRef} seat ${seatName} has an unknown provider outcome`,
        meta: { orderId: order.id, cancellationId },
      });
      return res.status(202).json({
        success: true,
        message: "Bus cancellation is being processed",
        data: {
          order_ref: orderRef,
          seatName,
          status: "processing",
          refundAmount: 0,
          refundStatus: "not_requested",
        },
      });
    }

    const providerErrorCode = Number(apiData?.Error?.ErrorCode ?? 0);
    const providerErrorMessage = String(apiData?.Error?.ErrorMessage || "");

    if (providerErrorCode !== 0) {
      await db.execute(
        `UPDATE busbooking_cancellations
            SET status = 'failed', provider_error_code = ?,
                provider_error_message = ?, raw_response = ?
          WHERE id = ?`,
        [
          String(providerErrorCode),
          providerErrorMessage || null,
          JSON.stringify(apiData),
          cancellationId,
        ],
      );
      return res.status(400).json({
        success: false,
        message: providerErrorMessage || "Unable to cancel bus seat",
        errorCode: providerErrorCode,
      });
    }

    const providerRefundAmount = Number(
      apiData?.RefundAmount ?? apiData?.Result?.RefundAmount ?? 0,
    );
    const providerStatus = String(apiData?.Status || "").trim();
    const providerCancelId = apiData?.CancelId ?? null;
    const isFinalSuccess = ["success", "cancelled", "canceled"].includes(
      providerStatus.toLowerCase(),
    );

    let refundId = null;
    let refundAmount = 0;

    connection = await db.getConnection();
    await connection.beginTransaction();

    if (isFinalSuccess) {
      ({ refundId, refundAmount } = await applyCancellationSuccess(connection, {
        order,
        cancellationId,
        providerRefundAmount,
        providerCancelId,
        providerStatus,
        rawResponse: apiData,
      }));
    } else {
      await connection.execute(
        `UPDATE busbooking_cancellations
            SET provider_cancel_id = ?, provider_status = ?, raw_response = ?
          WHERE id = ?`,
        [
          providerCancelId === null ? null : String(providerCancelId),
          providerStatus || null,
          JSON.stringify(apiData),
          cancellationId,
        ],
      );
    }

    await connection.commit();
    connection.release();
    connection = null;

    let refundStatus = "not_requested";
    if (refundId) {
      const refund = await processRefund(refundId);
      refundStatus = refund.status === "processed" ? "processed" : "pending";
    }

    if (!isFinalSuccess) {
      await sendOpsAlert({
        level: "error",
        category: "busbooking_review",
        message: `Bus cancellation for ${orderRef} seat ${seatName} returned non-final status "${providerStatus}"`,
        meta: { orderId: order.id, cancellationId },
      });
    }

    return res.status(isFinalSuccess ? 200 : 202).json({
      success: true,
      message: isFinalSuccess
        ? "Bus seat cancelled successfully"
        : "Bus cancellation is being processed",
      data: {
        order_ref: orderRef,
        seatName,
        cancelId: providerCancelId,
        status: providerStatus,
        refundAmount,
        refundStatus,
      },
    });
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch {}
    }

    if (cancellationId && !providerCalled) {
      try {
        await db.execute(
          `UPDATE busbooking_cancellations
              SET status = 'failed', provider_error_message = ?
            WHERE id = ? AND status = 'processing'`,
          ["Cancellation could not be started", cancellationId],
        );
      } catch (updateError) {
        console.error("[BusBooking][Cancel] Failed to record failure", updateError.message);
      }
    } else if (cancellationId) {
      await sendOpsAlert({
        level: "critical",
        category: "busbooking_review",
        message: `Bus cancellation for ${orderRef} seat ${seatName}: provider result could not be recorded`,
        meta: { cancellationId, error: error.message },
      });
    }

    console.error("[BusBooking][Cancel] Error", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to cancel bus seat",
    });
  } finally {
    if (connection) connection.release();
  }
};

const cancelBusTicket = async (req, res) => {
  const userId = req.user.user_id;
  const orderRef = String(req.body?.order_ref || "").trim();
  const rawSeatNames = req.body?.seatNames ?? req.body?.seatName;
  const remarks = String(req.body?.remarks || "").trim();
  const seatNames = (Array.isArray(rawSeatNames)
    ? rawSeatNames
    : typeof rawSeatNames === "string"
      ? rawSeatNames.split(",")
      : [])
    .map((seat) => String(seat).trim());

  if (!orderRef) {
    return res.status(400).json({ success: false, message: "order_ref is required" });
  }
  if (
    seatNames.length < 1 ||
    seatNames.length > 10 ||
    seatNames.some((seat) => seat.length < 1 || seat.length > 100) ||
    new Set(seatNames).size !== seatNames.length
  ) {
    return res.status(400).json({
      success: false,
      message: "seatNames must contain 1 to 10 unique seat names of at most 100 characters",
    });
  }
  if (remarks.length < 1 || remarks.length > 1000) {
    return res.status(400).json({
      success: false,
      message: "remarks must contain between 1 and 1000 characters",
    });
  }

  const requiredConfig = ["SRDV_CANCEL_URL", "SRDV_API_TOKEN"];
  const missingConfig = requiredConfig.filter(
    (key) => !String(process.env[key] || "").trim(),
  );
  if (missingConfig.length) {
    return res.status(500).json({
      success: false,
      message: "Cancellation provider configuration is missing",
      missingConfig,
    });
  }

  let connection;
  let order;
  let cancellationIds = [];
  let providerCalled = false;

  const updateCancellations = async (sql, params) => {
    if (!cancellationIds.length) return;
    const placeholders = cancellationIds.map(() => "?").join(",");
    await db.execute(
      `${sql} WHERE id IN (${placeholders})`,
      [...params, ...cancellationIds],
    );
  };

  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    const [[foundOrder]] = await connection.execute(
      `SELECT id, order_ref, trace_id, status, payment_status, raw_block_response
         FROM busbooking_orders
        WHERE order_ref = ? AND user_id = ?
        LIMIT 1
        FOR UPDATE`,
      [orderRef, userId],
    );
    order = foundOrder;
    if (!order) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Booking order not found" });
    }
    if (order.status !== "confirmed" || order.payment_status !== "paid") {
      await connection.rollback();
      return res.status(409).json({
        success: false,
        message: "Only a confirmed paid booking can be cancelled",
      });
    }

    const traceId = parsePositiveInteger(order.trace_id);
    if (!traceId) {
      await connection.rollback();
      return res.status(500).json({
        success: false,
        message: "Booking has an invalid provider reference",
      });
    }

    const [allPassengers] = await connection.execute(
      `SELECT p.seat_name, p.lead_passenger,
              c.status AS cancellation_status
         FROM busbooking_passengers p
         LEFT JOIN busbooking_cancellations c
           ON c.busbooking_order_id = p.busbooking_order_id
          AND c.seat_name = p.seat_name COLLATE utf8mb4_general_ci
          AND c.id = (
            SELECT MAX(c2.id)
              FROM busbooking_cancellations c2
             WHERE c2.busbooking_order_id = p.busbooking_order_id
               AND c2.seat_name = p.seat_name COLLATE utf8mb4_general_ci
          )
        WHERE p.busbooking_order_id = ?
        ORDER BY p.id ASC`,
      [order.id],
    );
    const requestedPassengers = allPassengers.filter((passenger) =>
      seatNames.includes(String(passenger.seat_name)),
    );
    if (requestedPassengers.length !== seatNames.length) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: "One or more seats do not belong to this booking",
      });
    }

    const activeSeats = allPassengers
      .filter((passenger) => passenger.cancellation_status !== "succeeded")
      .map((passenger) => String(passenger.seat_name));
    let blockResponse = order.raw_block_response;
    if (typeof blockResponse === "string") {
      try { blockResponse = JSON.parse(blockResponse); } catch { blockResponse = null; }
    }
    const partialAllowed = String(
      blockResponse?.PartialCancellationAllowed ?? "false",
    ).toLowerCase() === "true";
    const includesLead = requestedPassengers.some(
      (passenger) => Number(passenger.lead_passenger) === 1,
    );
    if ((!partialAllowed || includesLead) && !activeSeats.every((seat) => seatNames.includes(seat))) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: includesLead
          ? "Cancelling the lead passenger requires every remaining seat"
          : "This booking requires all remaining seats to be cancelled together",
        remainingSeatNames: activeSeats,
      });
    }

    const [existingRows] = await connection.execute(
      `SELECT id, seat_name, status, provider_cancel_id, provider_status
         FROM busbooking_cancellations
        WHERE busbooking_order_id = ?
          AND seat_name IN (${seatNames.map(() => "?").join(",")})
          AND id = (
            SELECT MAX(c2.id)
              FROM busbooking_cancellations c2
             WHERE c2.busbooking_order_id = busbooking_cancellations.busbooking_order_id
               AND c2.seat_name = busbooking_cancellations.seat_name COLLATE utf8mb4_general_ci
          )
        FOR UPDATE`,
      [order.id, ...seatNames],
    );
    if (existingRows.length) {
      const allSucceeded = existingRows.length === seatNames.length &&
        existingRows.every((row) => row.status === "succeeded");
      if (allSucceeded) {
        await connection.commit();
        return res.status(200).json({
          success: true,
          reused: true,
          message: "Requested seats are already cancelled",
          data: { order_ref: orderRef, seatNames, status: "succeeded" },
        });
      }
      const hasOpenRequest = existingRows.some(
        (row) => row.status !== "failed",
      );
      if (hasOpenRequest) {
        await connection.rollback();
        return res.status(409).json({
          success: false,
          message: "A cancellation already exists for one or more requested seats",
        });
      }
    }

    for (const seatName of seatNames) {
      const [insertResult] = await connection.execute(
        `INSERT INTO busbooking_cancellations
          (busbooking_order_id, user_id, seat_name, remarks, status)
         VALUES (?, ?, ?, ?, 'processing')`,
        [order.id, userId, seatName, remarks],
      );
      cancellationIds.push(insertResult.insertId);
    }
    await connection.commit();
    connection.release();
    connection = null;

    let apiData;
    providerCalled = true;
    try {
      const providerResponse = await srdvClient.post(
        process.env.SRDV_CANCEL_URL,
        { TraceId: traceId, SeatName: seatNames, Remarks: remarks },
        {
          headers: {
            "Api-Token": process.env.SRDV_API_TOKEN,
            "Content-Type": "application/json",
          },
          timeout: 30000,
        },
      );
      apiData = providerResponse.data;
    } catch (providerError) {
      const errorData = providerError.response?.data;
      const errorCode = Number(errorData?.Error?.ErrorCode ?? 0);
      if (errorCode === 7039 || isAmbiguousProviderError(providerError)) {
        await updateCancellations(
          `UPDATE busbooking_cancellations
              SET provider_cancel_id = ?, provider_status = 'MANUAL_CHECK_REQUIRED',
                  provider_error_code = ?, provider_error_message = ?, raw_response = ?`,
          [
            errorData?.CancelId == null ? null : String(errorData.CancelId),
            errorCode || null,
            String(errorData?.Error?.ErrorMessage || "Cancellation outcome is unknown"),
            errorData ? JSON.stringify(errorData) : null,
          ],
        );
        await sendOpsAlert({
          level: "critical",
          category: "busbooking_review",
          message: `Bus cancellation for ${orderRef} requires provider verification`,
          meta: { orderId: order.id, cancellationIds, seatNames, errorCode: errorCode || null },
        });
        return res.status(202).json({
          success: true,
          message: "Cancellation outcome requires verification",
          data: {
            order_ref: orderRef,
            seatNames,
            cancelId: errorData?.CancelId ?? null,
            status: "MANUAL_CHECK_REQUIRED",
            refundStatus: "not_requested",
          },
        });
      }

      await updateCancellations(
        `UPDATE busbooking_cancellations
            SET status = 'failed', provider_error_code = ?,
                provider_error_message = ?, raw_response = ?`,
        [
          errorCode || null,
          String(errorData?.Error?.ErrorMessage || providerError.message),
          errorData ? JSON.stringify(errorData) : null,
        ],
      );
      return res.status(400).json({
        success: false,
        message: String(errorData?.Error?.ErrorMessage || "Cancellation was rejected"),
        errorCode: errorCode || null,
      });
    }

    const providerErrorCode = Number(apiData?.Error?.ErrorCode ?? 0);
    const providerErrorMessage = String(apiData?.Error?.ErrorMessage || "").trim();
    const providerCancelId = apiData?.CancelId ?? null;
    if (providerErrorCode !== 0 && providerErrorCode !== 7039) {
      await updateCancellations(
        `UPDATE busbooking_cancellations
            SET status = 'failed', provider_error_code = ?,
                provider_error_message = ?, raw_response = ?`,
        [providerErrorCode, providerErrorMessage || null, JSON.stringify(apiData)],
      );
      return res.status(400).json({
        success: false,
        message: providerErrorMessage || "Cancellation was rejected",
        errorCode: providerErrorCode,
      });
    }

    const providerStatus = providerErrorCode === 7039
      ? "MANUAL_CHECK_REQUIRED"
      : String(apiData?.Status || "In Process").trim();
    await updateCancellations(
      `UPDATE busbooking_cancellations
          SET provider_cancel_id = ?, provider_status = ?,
              provider_error_code = ?, provider_error_message = ?, raw_response = ?`,
      [
        providerCancelId == null ? null : String(providerCancelId),
        providerStatus,
        providerErrorCode || null,
        providerErrorMessage || null,
        JSON.stringify(apiData),
      ],
    );
    if (providerErrorCode === 7039) {
      await sendOpsAlert({
        level: "critical",
        category: "busbooking_review",
        message: `Bus cancellation for ${orderRef} requires provider verification`,
        meta: { orderId: order.id, cancellationIds, seatNames, providerCancelId },
      });
    }

    return res.status(202).json({
      success: true,
      message: providerErrorCode === 7039
        ? "Cancellation outcome requires verification"
        : "Bus cancellation is in process",
      data: {
        order_ref: orderRef,
        seatNames,
        cancelId: providerCancelId,
        status: providerStatus,
        refundAmount: 0,
        refundStatus: "not_requested",
      },
    });
  } catch (error) {
    if (connection) {
      try { await connection.rollback(); } catch {}
    }
    if (cancellationIds.length && !providerCalled) {
      try {
        await updateCancellations(
          `UPDATE busbooking_cancellations
              SET status = 'failed', provider_error_message = ?`,
          ["Cancellation could not be started"],
        );
      } catch (updateError) {
        console.error("[BusBooking][Cancel] Failed to record failure", updateError.message);
      }
    }
    console.error("[BusBooking][Cancel] Error", error.message);
    return res.status(500).json({ success: false, message: "Unable to cancel bus seats" });
  } finally {
    if (connection) connection.release();
  }
};

/*
|--------------------------------------------------------------------------
| Admin review
|--------------------------------------------------------------------------
|
| A booking or cancellation whose provider outcome could not be determined is
| parked for staff, who check the provider and record what really happened.
|
|--------------------------------------------------------------------------
*/

const resolveBookingReview = async (req, res) => {
  const orderRef = String(req.body?.order_ref || "").trim();
  const outcome = String(req.body?.outcome || "").trim();
  const bookingId = String(req.body?.bookingId || "").trim();

  if (!orderRef || !["confirmed", "failed"].includes(outcome)) {
    return res.status(400).json({
      success: false,
      message: "order_ref and outcome (confirmed or failed) are required",
    });
  }

  if (outcome === "confirmed" && !bookingId) {
    return res.status(400).json({
      success: false,
      message: "bookingId is required to confirm a booking",
    });
  }

  try {
    const result = await resolveReviewedBooking(orderRef, {
      outcome,
      bookingId,
      ticketNo: String(req.body?.ticketNo || "").trim() || null,
      travelOperatorPNR: String(req.body?.travelOperatorPNR || "").trim() || null,
      note: String(req.body?.note || "").trim() || null,
    });

    if (!result.ok) {
      return res.status(result.status).json({ success: false, message: result.message });
    }

    console.info("[BusBooking][Review] Booking resolved", {
      orderRef,
      outcome,
      resolvedBy: req.user.user_id,
    });
    return res.status(200).json({
      success: true,
      data: {
        order_ref: orderRef,
        status: result.order.status,
        paymentStatus: result.order.payment_status,
      },
    });
  } catch (error) {
    console.error("[BusBooking][Review] Booking resolve failed", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to resolve booking",
    });
  }
};

const resolveCancellationReview = async (req, res) => {
  const orderRef = String(req.body?.order_ref || "").trim();
  const seatName = String(req.body?.seatName || "").trim();
  const outcome = String(req.body?.outcome || "").trim();
  const refundAmount = Number(req.body?.refundAmount ?? 0);

  if (!orderRef || !seatName || !["succeeded", "failed"].includes(outcome)) {
    return res.status(400).json({
      success: false,
      message: "order_ref, seatName and outcome (succeeded or failed) are required",
    });
  }

  if (!Number.isFinite(refundAmount) || refundAmount < 0) {
    return res.status(400).json({
      success: false,
      message: "refundAmount must be zero or a positive number",
    });
  }

  try {
    const result = await resolveCancellation(orderRef, seatName, {
      outcome,
      refundAmount,
      note: String(req.body?.note || "").trim() || null,
    });

    if (!result.ok) {
      return res.status(result.status).json({ success: false, message: result.message });
    }

    console.info("[BusBooking][Review] Cancellation resolved", {
      orderRef,
      seatName,
      outcome,
      resolvedBy: req.user.user_id,
    });
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("[BusBooking][Review] Cancellation resolve failed", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to resolve cancellation",
    });
  }
};

module.exports = {

    getCities,

    searchBuses,

    getSeatLayout,

    getBoardingDroppingPoints,

    blockSeat,

    createPaymentOrder,

    verifyPayment,

    bookBusTicket,

    getProviderBookingDetails,

    cancelBusTicket,

    resolveBookingReview,

    resolveCancellationReview,

    getProviderBalance,

    getProviderBalanceLog,
};
