const db = require("../../../config/database");
const axios = require("axios");
const crypto = require("crypto");
const razorpay = require("../../service/v1/middlewares/razorpay");
const BusModel =
    require("../models/busModel");

const BusBookingOrderModel =
  require(
    "../models/busBookingOrderModel"
  );
const {
  getBookingDecision,
  isExpectedCapturedPayment,
} = require("../utils/workflowPolicy");
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

    if (!date) {
        return false;
    }

    return /^\d{4}-\d{2}-\d{2}$/
        .test(date);
};


/*
|--------------------------------------------------------------------------
| Validate Journey Time
|--------------------------------------------------------------------------
|
| Required format:
|
| HH:mm
|
| Example:
| 09:30
| 18:00
| 22:15
|
|--------------------------------------------------------------------------
*/

const isValidTime = (time) => {

    if (!time) {
        return false;
    }

    return /^([01]\d|2[0-3]):([0-5]\d)$/
        .test(time);
};

const getMissingSearchConfig = () => {

    const requiredEnvKeys = [
        "SRDV_SEARCH_URL",
        "SRDV_API_TOKEN",
        "SRDV_CLIENT_ID",
        "SRDV_USERNAME",
        "SRDV_PASSWORD"
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

            journeyDate,

            journeyTime

        } = req.body;


        /*
        |--------------------------------------------------------------------------
        | Source City Validation
        |--------------------------------------------------------------------------
        */

        if (!sourceCityCode) {

            return res
                .status(400)
                .json({

                    success: false,

                    message:
                        "Source city is required"
                });
        }


        /*
        |--------------------------------------------------------------------------
        | Destination City Validation
        |--------------------------------------------------------------------------
        */

        if (!destinationCityCode) {

            return res
                .status(400)
                .json({

                    success: false,

                    message:
                        "Destination city is required"
                });
        }


        /*
        |--------------------------------------------------------------------------
        | Same City Validation
        |--------------------------------------------------------------------------
        */

        if (
            String(sourceCityCode) ===
            String(destinationCityCode)
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

        if (!isValidTime(journeyTime)) {

            return res
                .status(400)
                .json({

                    success: false,

                    message:
                        "Journey time must be in HH:mm format"
                });
        }


        /*
        |--------------------------------------------------------------------------
        | Optional Source / Destination City Lookup
        |--------------------------------------------------------------------------
        */

        const sourceCity =
            await getOptionalCityDetails(
                sourceCityCode
            );

        const destinationCity =
            await getOptionalCityDetails(
                destinationCityCode
            );

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
                String(sourceCityCode).trim(),

            ToCityCode:
                String(destinationCityCode).trim(),

            DepartDate:
                journeyDate,

            ClientId:
                process.env.SRDV_CLIENT_ID,

            UserName:
                process.env.SRDV_USERNAME,

            Password:
                process.env.SRDV_PASSWORD
        };


        /*
        |--------------------------------------------------------------------------
        | Call SRDV Search Bus API
        |--------------------------------------------------------------------------
        */

        const srdvResponse =
            await axios.post(

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
        | Filter Buses According To Selected Time
        |--------------------------------------------------------------------------
        |
        | User:
        |
        | journeyTime = 18:00
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

        const selectedDateTime =
            new Date(
                `${journeyDate}T${journeyTime}:00`
            );


        const filteredBuses =
            allBuses.filter(
                (bus) => {

                    if (
                        !bus.DepartureTime
                    ) {
                        return false;
                    }


                    const busDeparture =
                        new Date(
                            bus.DepartureTime
                        );


                    return (
                        busDeparture >=
                        selectedDateTime
                    );
                }
            );


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
                    filteredBuses.length > 0
                        ? "Buses found successfully"
                        : "No buses found after selected time",


                search: {

                    source: {

                        code:
                            String(sourceCityCode).trim(),

                        name:
                            sourceCity
                                ?.city_name || null
                    },


                    destination: {

                        code:
                            String(destinationCityCode).trim(),

                        name:
                            destinationCity
                                ?.city_name || null
                    },


                    journeyDate,

                    journeyTime
                },


                traceId:
                    apiData.TraceId ||
                    null,


                totalBusesFromProvider:
                    allBuses.length,


                count:
                    filteredBuses.length,


                buses:
                    filteredBuses
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
|   "traceId": "113855",
|   "srdvIndex": "39",
|   "resultIndex": "2000001857050059209"
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
            srdvIndex,
            resultIndex
        } = req.body;


        console.log("======================================");
        console.log("SEAT LAYOUT REQUEST RECEIVED");
        console.log("TraceId:", traceId);
        console.log("SrdvIndex:", srdvIndex);
        console.log("ResultIndex:", resultIndex);
        console.log("======================================");


        /*
        |--------------------------------------------------------------------------
        | Validation
        |--------------------------------------------------------------------------
        */

        if (!traceId) {

            return res
                .status(400)
                .json({

                    success: false,

                    message:
                        "TraceId is required"
                });
        }


        if (!srdvIndex) {

            return res
                .status(400)
                .json({

                    success: false,

                    message:
                        "SrdvIndex is required"
                });
        }


        if (!resultIndex) {

            return res
                .status(400)
                .json({

                    success: false,

                    message:
                        "ResultIndex is required"
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
            "SRDV_CLIENT_ID",
            "SRDV_USERNAME",
            "SRDV_PASSWORD"
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

            ClientId:
                process.env.SRDV_CLIENT_ID,

            UserName:
                process.env.SRDV_USERNAME,

            Password:
                process.env.SRDV_PASSWORD,

            TraceId:
                String(traceId).trim(),

            SrdvIndex:
                String(srdvIndex).trim(),

            ResultIndex:
                String(resultIndex).trim()
        };


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

            SrdvIndex:
                requestBody.SrdvIndex,

            ResultIndex:
                requestBody.ResultIndex
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
            await axios.post(

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

        const seatLayout =
            Array.isArray(
                apiData.Result
            )
                ? apiData.Result
                : [];


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

        const seats =
            seatLayout.flat();


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
                        seat.SeatStatus === "true"
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
                    apiData.TraceId ||
                    String(traceId),


                srdvIndex:
                    apiData.SrdvIndex ||
                    String(srdvIndex),


                resultIndex:
                    apiData.ResultIndex ||
                    String(resultIndex),


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
                    seatLayout
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
|   "traceId": "113855",
|   "srdvIndex": "39",
|   "resultIndex": "2000001857050059209"
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
      srdvIndex,
      resultIndex,
    } = req.body;


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
      "SrdvIndex:",
      srdvIndex
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
      traceId === undefined ||
      traceId === null ||
      String(traceId).trim() === ""
    ) {

      return res
        .status(400)
        .json({

          success: false,

          message:
            "traceId is required",
        });
    }


    if (
      srdvIndex === undefined ||
      srdvIndex === null ||
      String(srdvIndex).trim() === ""
    ) {

      return res
        .status(400)
        .json({

          success: false,

          message:
            "srdvIndex is required",
        });
    }


    if (
      resultIndex === undefined ||
      resultIndex === null ||
      String(resultIndex).trim() === ""
    ) {

      return res
        .status(400)
        .json({

          success: false,

          message:
            "resultIndex is required",
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

      "SRDV_CLIENT_ID",

      "SRDV_USERNAME",

      "SRDV_PASSWORD",
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

      ClientId:
        process.env
          .SRDV_CLIENT_ID,

      UserName:
        process.env
          .SRDV_USERNAME,

      Password:
        process.env
          .SRDV_PASSWORD,

      TraceId:
        String(
          traceId
        ).trim(),

      SrdvIndex:
        String(
          srdvIndex
        ).trim(),

      ResultIndex:
        String(
          resultIndex
        ).trim(),
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

        SrdvIndex:
          requestBody.SrdvIndex,

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
      await axios.post(

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
          apiData.TraceId ||
          String(
            traceId
          ),


        srdvIndex:
          apiData.SrdvIndex ||
          String(
            srdvIndex
          ),


        resultIndex:
          apiData.ResultIndex ||
          String(
            resultIndex
          ),


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

        srdvIndex,

        resultIndex,

        boardingPointId,

        droppingPointId,

        refId,

        passengers,

        email,

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
        !srdvIndex
      ) {

        return res
          .status(400)
          .json({

            success:
              false,

            message:
              "srdvIndex is required",
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

      const fallbackEmail =
        typeof email === "string" &&
        email.trim()
          ? email.trim()
          : null;


      const normalizedPassengers =
        passengers.map(
          (passenger) => {
            const phoneDigits =
              String(
                passenger?.PhoneNo ||
                ""
              )
                .replace(/\D/g, "")
                .trim();

            const generatedPassengerEmail =
              phoneDigits
                ? `busbooking+${phoneDigits}@rewardplanners.com`
                : "busbooking@rewardplanners.com";

            const passengerEmail =
              typeof passenger?.Email === "string" &&
              passenger.Email.trim()
                ? passenger.Email.trim()
                : (
                    fallbackEmail ||
                    generatedPassengerEmail
                  );

            return {
              ...passenger,
              Email:
                passengerEmail,
            };
          }
        );


      /*
      |--------------------------------------------------------------------------
      | Required Provider Config
      |--------------------------------------------------------------------------
      */

      const requiredConfig = [

        "SRDV_BLOCK_URL",

        "SRDV_API_TOKEN",

        "SRDV_CLIENT_ID",

        "SRDV_USERNAME",

        "SRDV_PASSWORD",

        "SRDV_END_USER_IP",
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

        EndUserIp:
          process.env
            .SRDV_END_USER_IP,

        ClientId:
          process.env
            .SRDV_CLIENT_ID,

        UserName:
          process.env
            .SRDV_USERNAME,

        Password:
          process.env
            .SRDV_PASSWORD,

        TraceId:
          String(
            traceId
          ).trim(),

        SrdvIndex:
          String(
            srdvIndex
          ).trim(),

        ResultIndex:
          String(
            resultIndex
          ).trim(),

        BoardingPointId:
          String(
            boardingPointId
          ).trim(),

        DroppingPointId:
          String(
            droppingPointId
          ).trim(),

        RefId:
          String(
            refId
          ).trim(),

        Passengers:
          normalizedPassengers,
      };


      console.log(
        "[BusBooking][Block] Provider Request",
        {

          TraceId:
            requestBody.TraceId,

          SrdvIndex:
            requestBody.SrdvIndex,

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
        await axios.post(

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


      /*
      |--------------------------------------------------------------------------
      | Last Fallback From Passenger Seat Price
      |--------------------------------------------------------------------------
      */

      if (
        totalAmount <= 0
      ) {

        totalAmount =
          normalizedPassengers.reduce(
            (
              total,
              passenger
            ) => {

              const fare =
                Number(
                  passenger
                    ?.Seat
                    ?.Price
                    ?.PublishedFare ||
                  passenger
                    ?.Seat
                    ?.Price
                    ?.OfferedFare ||
                  passenger
                    ?.Seat
                    ?.SeatFare ||
                  0
                );


              return (
                total +
                fare
              );
            },

            0
          );
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
                      ?.TraceId ||
                    traceId
                  ),

                srdv_index:
                  String(
                    apiData
                      ?.SrdvIndex ||
                    srdvIndex
                  ),

                result_index:
                  String(
                    apiData
                      ?.ResultIndex ||
                    resultIndex
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
                    boardingPointId
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
                    droppingPointId
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
                  ?.TraceId ||
                traceId
              ),

            srdvIndex:
              String(
                apiData
                  ?.SrdvIndex ||
                srdvIndex
              ),

            resultIndex:
              String(
                apiData
                  ?.ResultIndex ||
                resultIndex
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

              payment_status

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
              AND client_id = ?
              AND status IN (
                'created',
                'pending'
              )

            ORDER BY id DESC

            LIMIT 1
            `,
            [
              cleanOrderRef,
              userId,
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
            client_id,

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
            ?, ?, ?, ?, ?,
            'created',
            ?,
            'busbooking',
            ?
          )
          `,
          [
            userId,

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
            ref_id,
            module,
            amount,
            client_id,
            status,
            razorpay_payment_id
          FROM razorpay_orders
          WHERE razorpay_order_id = ?
            AND client_id = ?
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


const bookBusTicket = async (
  req,
  res
) => {

  let connection;

  try {

    /*
    |--------------------------------------------------------------------------
    | Receive Data From Frontend
    |--------------------------------------------------------------------------
    */

    const orderRef =
      String(
        req.body?.order_ref ||
        ""
      ).trim();

    if (!orderRef) {
      return res.status(400).json({
        success: false,
        message: "order_ref is required",
      });
    }

    connection =
      await db.getConnection();

    await connection.beginTransaction();

    const [orderRows] =
      await connection.execute(
        `
        SELECT
          id,
          order_ref,
          trace_id,
          srdv_index,
          result_index,
          status,
          payment_status,
          provider_booking_id,
          ticket_no,
          travel_operator_pnr
        FROM busbooking_orders
        WHERE order_ref = ?
          AND user_id = ?
        LIMIT 1
        FOR UPDATE
        `,
        [orderRef, req.user.user_id]
      );

    const order =
      orderRows[0];

    const bookingDecision =
      getBookingDecision(order);

    if (bookingDecision === "not_found") {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: "Booking order not found",
      });
    }

    if (bookingDecision === "already_confirmed") {
      await connection.commit();
      return res.status(200).json({
        success: true,
        reused: true,
        message: "Bus ticket already booked",
        orderRef: order.order_ref,
        bookingId: order.provider_booking_id,
        ticketNo: order.ticket_no,
        travelOperatorPNR: order.travel_operator_pnr,
      });
    }

    if (bookingDecision !== "book") {
      await connection.rollback();
      return res.status(409).json({
        success: false,
        message: "A captured payment is required before booking",
      });
    }

    const traceId = order.trace_id;
    const srdvIndex = order.srdv_index;
    const resultIndex = order.result_index;


    /*
    |--------------------------------------------------------------------------
    | Validate TraceId
    |--------------------------------------------------------------------------
    */

    if (
      traceId === undefined ||
      traceId === null ||
      String(
        traceId
      ).trim() === ""
    ) {

      return res
        .status(400)
        .json({

          success: false,

          message:
            "traceId is required",
        });
    }


    /*
    |--------------------------------------------------------------------------
    | Validate SrdvIndex
    |--------------------------------------------------------------------------
    */

    if (
      srdvIndex === undefined ||
      srdvIndex === null ||
      String(
        srdvIndex
      ).trim() === ""
    ) {

      return res
        .status(400)
        .json({

          success: false,

          message:
            "srdvIndex is required",
        });
    }


    /*
    |--------------------------------------------------------------------------
    | Validate ResultIndex
    |--------------------------------------------------------------------------
    */

    if (
      resultIndex === undefined ||
      resultIndex === null ||
      String(
        resultIndex
      ).trim() === ""
    ) {

      return res
        .status(400)
        .json({

          success: false,

          message:
            "resultIndex is required",
        });
    }


    /*
    |--------------------------------------------------------------------------
    | Validate Provider Configuration
    |--------------------------------------------------------------------------
    */

    const requiredConfig = [
      "SRDV_BOOK_URL",
      "SRDV_API_TOKEN",
      "SRDV_CLIENT_ID",
      "SRDV_USERNAME",
      "SRDV_PASSWORD",
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

      console.error(
        "[BusBooking][Book] Missing configuration",
        missingConfig
      );


      return res
        .status(500)
        .json({

          success: false,

          message:
            "Book API provider configuration is missing",

          missingConfig,
        });
    }


    /*
    |--------------------------------------------------------------------------
    | Build Exact Provider Request Body
    |--------------------------------------------------------------------------
    |
    | Important:
    |
    | This body matches the Book API request you tested successfully.
    |
    |--------------------------------------------------------------------------
    */

    const requestBody = {

      ClientId:
        process.env
          .SRDV_CLIENT_ID,

      UserName:
        process.env
          .SRDV_USERNAME,

      Password:
        process.env
          .SRDV_PASSWORD,

      TraceId:
        String(
          traceId
        ).trim(),

      SrdvIndex:
        String(
          srdvIndex
        ).trim(),

      ResultIndex:
        String(
          resultIndex
        ).trim(),
    };


    /*
    |--------------------------------------------------------------------------
    | Safe Log
    |--------------------------------------------------------------------------
    |
    | Do NOT print ClientId/UserName/Password.
    |
    |--------------------------------------------------------------------------
    */

    console.log(
      "[BusBooking][Book] Provider Request",
      {

        TraceId:
          requestBody
            .TraceId,

        SrdvIndex:
          requestBody
            .SrdvIndex,

        ResultIndex:
          requestBody
            .ResultIndex,
      }
    );


    /*
    |--------------------------------------------------------------------------
    | Provider Headers
    |--------------------------------------------------------------------------
    */

    const headers = {

      "Content-Type":
        "application/json",

      "Api-Token":
        process.env
          .SRDV_API_TOKEN,
    };


    /*
    |--------------------------------------------------------------------------
    | Call Provider Book API
    |--------------------------------------------------------------------------
    */

    const providerResponse =
      await axios.post(

        process.env
          .SRDV_BOOK_URL,

        requestBody,

        {
          headers,

          timeout:
            30000,
        }
      );


    /*
    |--------------------------------------------------------------------------
    | Provider Response
    |--------------------------------------------------------------------------
    */

    const apiData =
      providerResponse
        .data;


    /*
    |--------------------------------------------------------------------------
    | Check Provider Error
    |--------------------------------------------------------------------------
    */

    const providerErrorCode =
      Number(
        apiData
          ?.Error
          ?.ErrorCode ??
        0
      );


    const providerErrorMessage =
      String(
        apiData
          ?.Error
          ?.ErrorMessage ||
        ""
      );


    if (
      providerErrorCode !==
      0
    ) {

      await connection.rollback();

      console.log(
        "[BusBooking][Book] Provider Error",
        {
          providerErrorCode,
          providerErrorMessage,
          traceId:
            apiData
              ?.TraceId,
        }
      );


      return res
        .status(400)
        .json({

          success: false,

          message:
            providerErrorMessage ||
            "Unable to book bus ticket",

          errorCode:
            providerErrorCode,

          traceId:
            apiData
              ?.TraceId ||
            String(
              traceId
            ),

        });
    }


    /*
    |--------------------------------------------------------------------------
    | Extract Booking Result
    |--------------------------------------------------------------------------
    */

    const bookingId =
      apiData
        ?.BookingId ??
      null;


    const bookingStatus =
      apiData
        ?.Result
        ?.BusBookingStatus ||
      null;


    const ticketNo =
      apiData
        ?.Result
        ?.TicketNo ||
      null;


    const travelOperatorPNR =
      apiData
        ?.Result
        ?.TravelOperatorPNR ||
      null;


    /*
    |--------------------------------------------------------------------------
    | Validate Successful Booking
    |--------------------------------------------------------------------------
    */

    if (
      !bookingId
    ) {

      await connection.rollback();

      console.error(
        "[BusBooking][Book] BookingId missing",
        { traceId }
      );


      return res
        .status(400)
        .json({

          success: false,

          message:
            "Provider did not return BookingId",

        });
    }


    /*
    |--------------------------------------------------------------------------
    | Validate Booking Status
    |--------------------------------------------------------------------------
    */

    if (
      String(
        bookingStatus ||
        ""
      ).toLowerCase() !==
      "success"
    ) {

      await connection.rollback();

      console.error(
        "[BusBooking][Book] Booking status was not successful",
        {
          bookingId,
          bookingStatus,
          ticketNo,
        }
      );


      return res
        .status(400)
        .json({

          success: false,

          message:
            "Bus booking was not successful",

          bookingId,

          bookingStatus,

        });
    }


    await connection.execute(
      `
      UPDATE busbooking_orders
      SET
        status = 'confirmed',
        provider_booking_id = ?,
        ticket_no = ?,
        travel_operator_pnr = ?,
        raw_book_response = ?
      WHERE id = ?
        AND payment_status = 'paid'
      `,
      [
        String(bookingId),
        ticketNo,
        travelOperatorPNR,
        JSON.stringify(apiData),
        order.id,
      ]
    );

    await connection.commit();


    /*
    |--------------------------------------------------------------------------
    | Return Clean Response To React Native
    |--------------------------------------------------------------------------
    */

    return res
      .status(200)
      .json({

        success: true,

        message:
          "Bus ticket booked successfully",

        orderRef,


        /*
        |--------------------------------------------------------------------------
        | Booking Session
        |--------------------------------------------------------------------------
        */

        traceId:
          String(
            apiData
              ?.TraceId ||
            traceId
          ),

        srdvIndex:
          String(
            apiData
              ?.SrdvIndex ||
            srdvIndex
          ),

        resultIndex:
          String(
            apiData
              ?.ResultIndex ||
            resultIndex
          ),


        /*
        |--------------------------------------------------------------------------
        | Final Booking Details
        |--------------------------------------------------------------------------
        */

        bookingId,

        bookingStatus,

        ticketNo,

        travelOperatorPNR,
      });


  } catch (
    error
  ) {

    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error(
          "[BusBooking][Book] Rollback failed",
          rollbackError.message
        );
      }
    }

    /*
    |--------------------------------------------------------------------------
    | Provider HTTP Error
    |--------------------------------------------------------------------------
    */

    if (
      error.response
    ) {

      console.error(
        "[BusBooking][Book] Provider HTTP Error",
        {

          status:
            error.response
              .status,

        }
      );


      const providerData =
        error.response
          .data;


      return res
        .status(
          error.response
            .status ||
          500
        )
        .json({

          success: false,

          message:
            providerData
              ?.Error
              ?.ErrorMessage ||

            providerData
              ?.message ||

            "Book provider API error",

        });
    }


    /*
    |--------------------------------------------------------------------------
    | Network / Internal Error
    |--------------------------------------------------------------------------
    */

    console.error(
      "[BusBooking][Book] Error",
      error.message
    );


    return res
      .status(500)
      .json({

        success: false,

        message:
          "Unable to book bus ticket",

      });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

const getProviderBalance = async (req, res) => {
  const requiredConfig = [
    "SRDV_BALANCE_URL",
    "SRDV_API_TOKEN",
    "SRDV_CLIENT_ID",
    "SRDV_USERNAME",
    "SRDV_PASSWORD",
    "SRDV_END_USER_IP",
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
    const providerResponse = await axios.post(
      process.env.SRDV_BALANCE_URL,
      {
        EndUserIp: process.env.SRDV_END_USER_IP,
        ClientId: process.env.SRDV_CLIENT_ID,
        UserName: process.env.SRDV_USERNAME,
        Password: process.env.SRDV_PASSWORD,
      },
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
        balance: apiData?.Balance ?? null,
        creditLimit: apiData?.CreditLimit ?? null,
      },
    });
  } catch (error) {
    console.error("[BusBooking][Balance] Error", error.message);
    return res.status(error.response ? 502 : 500).json({
      success: false,
      message: "Unable to fetch provider balance",
    });
  }
};

const cancelBusTicket = async (req, res) => {
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
    "SRDV_CLIENT_ID",
    "SRDV_USERNAME",
    "SRDV_PASSWORD",
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

  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    const [orderRows] = await connection.execute(
      `SELECT id, trace_id, seat_count, status, payment_status
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
      `SELECT id, status, refund_status, raw_response
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

    const providerResponse = await axios.post(
      process.env.SRDV_CANCEL_URL,
      {
        ClientId: process.env.SRDV_CLIENT_ID,
        UserName: process.env.SRDV_USERNAME,
        Password: process.env.SRDV_PASSWORD,
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

    const apiData = providerResponse.data;
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

    const refundAmount = Number(
      apiData?.RefundAmount ?? apiData?.Result?.RefundAmount ?? 0,
    );
    const refundStatus = refundAmount > 0 ? "pending" : "not_requested";
    const providerStatus = String(apiData?.Status || "").trim();
    const providerCancelId = apiData?.CancelId ?? null;
    const isFinalSuccess = ["success", "cancelled", "canceled"].includes(
      providerStatus.toLowerCase(),
    );

    connection = await db.getConnection();
    await connection.beginTransaction();
    await connection.execute(
      `UPDATE busbooking_cancellations
          SET status = ?, refund_status = ?, provider_cancel_id = ?,
              provider_status = ?, raw_response = ?
        WHERE id = ?`,
      [
        isFinalSuccess ? "succeeded" : "processing",
        refundStatus,
        providerCancelId === null ? null : String(providerCancelId),
        providerStatus || null,
        JSON.stringify(apiData),
        cancellationId,
      ],
    );

    if (isFinalSuccess) {
      const [[cancellationCount]] = await connection.execute(
        `SELECT COUNT(*) AS count
           FROM busbooking_cancellations
          WHERE busbooking_order_id = ? AND status = 'succeeded'`,
        [order.id],
      );

      if (Number(cancellationCount.count) >= Number(order.seat_count)) {
        await connection.execute(
          `UPDATE busbooking_orders SET status = 'cancelled' WHERE id = ?`,
          [order.id],
        );
      }
    }
    await connection.commit();

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

    if (cancellationId) {
      try {
        await db.execute(
          `UPDATE busbooking_cancellations
              SET status = 'failed', provider_error_message = ?
            WHERE id = ? AND status = 'processing'`,
          ["Cancellation provider request failed", cancellationId],
        );
      } catch (updateError) {
        console.error("[BusBooking][Cancel] Failed to record failure", updateError.message);
      }
    }

    console.error("[BusBooking][Cancel] Error", error.message);
    return res.status(error.response ? 502 : 500).json({
      success: false,
      message: "Unable to cancel bus seat",
    });
  } finally {
    if (connection) connection.release();
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

    cancelBusTicket,

    getProviderBalance,
};
