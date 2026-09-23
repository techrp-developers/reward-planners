const express =
    require("express");


const router =
    express.Router();


/*
|--------------------------------------------------------------------------
| Customer / Mobile Auth
|--------------------------------------------------------------------------
|
| IMPORTANT:
|
| This is the SAME authentication middleware used by the Service module.
|
|--------------------------------------------------------------------------
*/

const auth =
    require("../middlewares/auth");


/*
|--------------------------------------------------------------------------
| Drain Mode
|--------------------------------------------------------------------------
*/

const drainMode =
    require("../../../middleware/drainMode");


/*
|--------------------------------------------------------------------------
| Payment Rate Limiter
|--------------------------------------------------------------------------
*/

const {
    paymentLimiter
} = require(
    "../../common/middlewares/rateLimiter"
);


/*
|--------------------------------------------------------------------------
| Controller
|--------------------------------------------------------------------------
*/

const {

    getCities,

    searchBuses,

    getSeatLayout,

    getBoardingDroppingPoints,

    blockSeat,

    createPaymentOrder,

    verifyPayment,

    bookBusTicket,

} = require(
    "../controllers/busController"
);


/*
|--------------------------------------------------------------------------
| Search Cities
|--------------------------------------------------------------------------
*/

router.get(
    "/cities",
    getCities
);


/*
|--------------------------------------------------------------------------
| Search Buses
|--------------------------------------------------------------------------
*/

router.post(
    "/search",
    searchBuses
);


/*
|--------------------------------------------------------------------------
| Get Seat Layout
|--------------------------------------------------------------------------
*/

router.post(
    "/seat-layout",
    getSeatLayout
);


/*
|--------------------------------------------------------------------------
| Boarding / Dropping
|--------------------------------------------------------------------------
*/

router.post(
    "/boarding-dropping-points",
    getBoardingDroppingPoints
);


/*
|--------------------------------------------------------------------------
| Authentication Test
|--------------------------------------------------------------------------
|
| Temporary route.
|
| Use it to confirm that the SAME mobile token used by Service is accepted
| by the local Bus Booking backend.
|
|--------------------------------------------------------------------------
*/

router.get(
    "/auth-test",

    auth,

    (req, res) => {

        return res
            .status(200)
            .json({

                success: true,

                message:
                    "Bus Booking authentication working",

                user: {

                    user_id:
                        req.user?.user_id,

                    email:
                        req.user?.email,

                    role:
                        req.user?.role
                }
            });
    }
);


/*
|--------------------------------------------------------------------------
| Block Bus Seat
|--------------------------------------------------------------------------
*/

router.post(
    "/block",

    // auth,

    blockSeat
);


/*
|--------------------------------------------------------------------------
| Create Bus Razorpay Order
|--------------------------------------------------------------------------
|
| Same architecture as:
|
| /service/create-order
|
|--------------------------------------------------------------------------
*/

router.post(
    "/create-order",
    paymentLimiter,

    drainMode,

    createPaymentOrder
);


/*
|--------------------------------------------------------------------------
| Verify Bus Razorpay Payment
|--------------------------------------------------------------------------
*/

router.post(
    "/verify-payment",
    paymentLimiter,

    verifyPayment
);


/*
|--------------------------------------------------------------------------
| Final Provider Book
|--------------------------------------------------------------------------
|
| Keep authenticated.
|
| Final production flow should execute provider booking only after payment
| verification succeeds.
|
|--------------------------------------------------------------------------
*/

router.post(
    "/book",
    bookBusTicket
);


module.exports =
    router;
