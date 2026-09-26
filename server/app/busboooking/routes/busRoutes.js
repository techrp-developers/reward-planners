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

const customerOnly = (req, res, next) => {
    if (req.user?.auth_source !== "customer") {
        return res.status(403).json({
            success: false,
            message: "Customer account required",
        });
    }

    return next();
};

const adminOnly = (req, res, next) => {
    if (req.user?.auth_source !== "crm" || req.user?.role !== "admin") {
        return res.status(403).json({
            success: false,
            message: "Administrator access required",
        });
    }

    return next();
};


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
    paymentLimiter,
    providerReadLimiter,
    checkoutLimiter,
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

    cancelBusTicket,

    getProviderBalance,

    getProviderBalanceLog,

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
    auth,
    customerOnly,
    providerReadLimiter,
    searchBuses
);


/*
|--------------------------------------------------------------------------
| Get Seat Layout
|--------------------------------------------------------------------------
*/

router.post(
    "/seat-layout",
    auth,
    customerOnly,
    providerReadLimiter,
    getSeatLayout
);


/*
|--------------------------------------------------------------------------
| Boarding / Dropping
|--------------------------------------------------------------------------
*/

router.post(
    "/boarding-dropping-points",
    auth,
    customerOnly,
    providerReadLimiter,
    getBoardingDroppingPoints
);


/*
|--------------------------------------------------------------------------
| Block Bus Seat
|--------------------------------------------------------------------------
*/

router.post(
    "/block",
    auth,
    customerOnly,
    checkoutLimiter,
    drainMode,
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
    auth,
    customerOnly,
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
    auth,
    customerOnly,
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
    auth,
    customerOnly,
    checkoutLimiter,
    drainMode,
    bookBusTicket
);

router.post(
    "/cancel",
    auth,
    customerOnly,
    checkoutLimiter,
    drainMode,
    cancelBusTicket
);

router.post(
    "/balance",
    auth,
    adminOnly,
    providerReadLimiter,
    getProviderBalance
);

router.post(
    "/balance-log",
    auth,
    adminOnly,
    providerReadLimiter,
    getProviderBalanceLog
);


module.exports =
    router;
