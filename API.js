const ccxt = require("ccxt");
const cors = require("cors");
const TechnicalIndicators = require("technicalindicators");
const AbortController = require("abort-controller");
const moment = require("moment");
const dayjs = require("dayjs");
const express = require("express");
const userModel = require("./models/users");
const jwt = require("jsonwebtoken");
require("./database");
// For encrypting password
const bcrypt = require("bcrypt");
const verifyToken = require("./middleware/verifytoken");
const saltRounds = 10;
const app = express();
app.use(cors());
global.AbortController = AbortController;
//let flag = false;
let buy_signal, sell_signal;
const cookieParser = require("cookie-parser");
//const cors = require("cors");
var bodyParser = require("body-parser");
app.use(express.json());
//app.use(cors());
app.use(cookieParser());

app.use(bodyParser.urlencoded({ extended: false }));

// parse application/json
app.use(bodyParser.json());

// let apiKey = "",
//   secret = "";
//let binance;
//binance.timeout(2000);

//binance.enableRateLimit = false;

// User signup
app.post("/users", async (req, res) => {
  try {
    const { name, email, password, apiKey, secret } = req.body;
    const user = await userModel.findOne({
      $or: [{ email }, { apiKey }, { secret }],
    });

    if (user) {
      res.status(400).send({
        error: true,
        message: "User already exists",
      });
    } else {
      const salt = bcrypt.genSaltSync(saltRounds);
      const hashPassword = bcrypt.hashSync(password, salt);
      const user = new userModel({
        name,
        email,
        password: hashPassword,
        apiKey,
        secret,
      });

      const createUser = await user.save();

      if (!createUser) {
        res.status(400).send({
          error: true,
          message: "Signup failed! Please try again",
        });
      } else {
        res.status(201).send({
          error: false,
          result: createUser,
          message: "User signed up successfully",
        });
      }
    }
  } catch (error) {
    console.error(error, "<<-- Error in user create");
    res.status(500).send({
      error: true,
      err: error?.message ?? error,
      message: "User signup failed",
    });
  }
});

// User login
app.post("/users/login", async (req, res) => {
  try {
    const user = await userModel.findOne({
      email: req.body.email,
    });

    if (!user) {
      res.status(404).send({
        error: true,
        message: "User not found",
      });
    } else {
      let checkPass = bcrypt.compareSync(req.body.password, user.password);
      if (checkPass) {
        let expDate = moment().utc().add(7, "day").format();

        let userPayload = {
          userId: user._id,
          email: user.email,
          expDate,
        };
        const token = jwt.sign(userPayload, "cryptobotapi");
        res.status(200).send({
          error: false,
          result: user,
          token,
          messsage: "User logged in successfully",
        });
      } else {
        res.status(400).send({
          error: true,
          messsage: "Password did not match",
        });
      }
    }
  } catch (error) {
    console.error(error, "<<-- Error in login");
    res.status(500).send({
      error: true,
      err: error?.message ?? error,
      message: "User login failed",
    });
  }
});

//start button
app.post("/start-bot", verifyToken, async (req, res) => {
  try {
    const update_user = await userModel.updateOne(
      { _id: req.user._id },
      { $set: { status: true } }
    );
    console.log(update_user, "update user flag");
    //const user = await userModel.findOne({ apiKey: req.user.apiKey });
    const flag = req.user.status;
    console.log("start flag", flag);
    console.log(req.user, "Req.user");
    const apiKey = req.user.apiKey;
    const secret = req.user.secret;
    //apiKey = req.body.apiKey;
    // secret = req.body.secret;

    const binance = new ccxt.binance({
      apiKey,
      secret,
      timeout: 30000,
    });
    console.log(apiKey, secret, "Keys");
    //apiKey = "90MXfc9ITdALCmUHi84UGKEa0Y4GrCkrDA3FM65Y0qzTEnkTvBE9TMLhaso1Fkf4";
    //secret = "zGnVWxMt7yQmXxuWQWxyoP5IuepgvabYd74EAnQgrVJaBsZD93sUKrC8tsHAheRs";
    const openOrders = await binance.fetchOpenOrders("BTC/TUSD");
    console.log(openOrders, "open orders");
    if (openOrders.length > 0) {
      res.json({
        message: `Found ${openOrders.length} pending orders. Bot will not start `,
      });
    } else {
      const {
        initial_investment_in_USD,
        profit_per,
        stop_loss_per,
        indicator_timeframe,
      } = req.body;

      res.json({ message: "bot started" });
      await buy(
        "BTC/TUSD",
        initial_investment_in_USD,
        profit_per,
        stop_loss_per,
        indicator_timeframe,
        apiKey,
        secret
        //flag
      );
    }

    //wait for pending order to execute
  } catch (err) {
    console.log(err);
  }
});
//stop button
app.post("/stop-bot", verifyToken, async (req, res) => {
  try {
    const flag = await userModel.updateOne(
      { _id: req.user._id },
      { $set: { status: false } }
    );
    res.json({ message: "bot stopped" });
    //await waitForBot(false);
  } catch (err) {
    console.log(err);
  }
});
//get-balance
app.get("/get-balance", verifyToken, async (req, res) => {
  try {
    //console.log(req.user.apiKey, "<<- req.user.apiKey");
    apiKey = req.user.apiKey;
    secret = req.user.secret;

    const binance = new ccxt.binance({
      apiKey,
      secret,
      timeout: 30000,
    });

    let balance = await binance.fetchBalance();

    balance = balance[`${req.query.symbol}`];

    res.status(200).send({
      status: "success",
      balance,
    });
  } catch (err) {
    console.log(err);
  }
});

//get-pending-orders
app.get("/get-pending-orders", verifyToken, async (req, res) => {
  try {
    apiKey = req.user.apiKey;
    secret = req.user.secret;

    const binance = new ccxt.binance({
      apiKey,
      secret,
      timeout: 30000,
    });
    const { symbol } = req.query;
    let pending_orders = await binance.fetchOpenOrders(`${symbol}`);
    if (pending_orders.length === 0) {
      res.json({ message: "No Pending orders" });
    } else {
      res.json({ message: "Pending orders", pending_orders });
    }
  } catch (err) {
    console.log(err);
  }
});

// async function waitForBot(flag) {
//   while (!flag) {
//     console.log("Bot stopped");
//     console.log("wait for starting");
//     await new Promise((waitForBot) => setTimeout(waitForBot, 1000));
//   }
// }
// async function waitForPendingOrder() {
//   const pending_order = await binance.fetchOpenOrders("BTC/TUSD");
//   if (pending_order.length > 0) {
//     while (pending_order.length > 0) {
//       console.log("wait for pending order");
//       await new Promise((waitForBot) => setTimeout(waitForBot, 1000));
//       await waitForPendingOrder();
//     }
//   } else {
//     return pending_order;
//   }
// }

//buy function
async function buy(
  symbol,
  initial_investment_in_USD,
  profit_per,
  stop_loss_per,
  indicator_timeframe,
  apiKey,
  secret
  //flag
) {
  return new Promise(async (resolve, reject) => {
    const user = await userModel.findOne({ apiKey });
    const flag = user.status;
    try {
      if (flag) {
        //apiKey = req.user.apiKey;
        //secret = req.user.secret;

        const binance = new ccxt.binance({
          apiKey,
          secret,
          timeout: 30000,
        });
        await new Promise((resolve) => setTimeout(resolve, 5000));
        let ticker = await binance.fetchTicker(`${symbol}`);
        const timeoutInSeconds = 10;
        const timeoutMillis = timeoutInSeconds * 1000;
        const startTime = Date.now();

        let bid = ticker.bid;
        const first_order = initial_investment_in_USD / bid;
        const order1 = await binance.createOrder(
          `${symbol}`,
          "limit",
          "buy",
          first_order,
          bid
        );

        while (Date.now() - startTime < timeoutMillis) {
          console.log(Date.now(), startTime, timeoutInSeconds);
          // Check if the order has been filled
          const orderStatus = await binance.fetchOrder(order1.id, "BTCTUSD");

          if (orderStatus.filled === orderStatus.amount) {
            console.log(`Order filled successfully.`, orderStatus);
            await waitForSell(
              "BTC/TUSD",
              orderStatus.amount,
              orderStatus.price,
              profit_per,
              stop_loss_per,
              indicator_timeframe,
              initial_investment_in_USD,
              apiKey,
              secret
              //flag
            );
          }

          // Sleep for a short interval (e.g., 1 second) before checking again
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }
        //await new Promise((resolve) => setTimeout(resolve, 1000));
        let orderStatus = await binance.fetchOrder(order1.id, "BTCTUSD");
        if (orderStatus.filled > 0 && orderStatus.filled < orderStatus.amount) {
          console.log("order partially filled");
          orderStatus = await binance.fetchOrder(order1.id, "BTCTUSD");
          while (
            orderStatus.filled > 0 &&
            orderStatus.filled < orderStatus.amount
          ) {
            console.log("order partially filled");
            orderStatus = await binance.fetchOrder(order1.id, "BTCTUSD");
            if (orderStatus.filled === orderStatus.amount) {
              console.log(`Order filled successfully.`, orderStatus);
              await waitForSell(
                "BTC/TUSD",
                orderStatus.amount,
                orderStatus.price,
                profit_per,
                stop_loss_per,
                indicator_timeframe,
                initial_investment_in_USD,
                apiKey,
                secret
                //flag
              );
            }
            await new Promise((resolve) => setTimeout(resolve, 3000));
          }
          if (orderStatus.filled === orderStatus.amount) {
            console.log(`Order filled successfully.`, orderStatus);
            await waitForSell(
              "BTC/TUSD",
              orderStatus.amount,
              orderStatus.price,
              profit_per,
              stop_loss_per,
              indicator_timeframe,
              initial_investment_in_USD,
              apiKey,
              secret
              //flag
            );
          }
        } else if (orderStatus.filled === 0) {
          // If the order hasn't filled within the timeout, cancel it
          const cancel_order = await binance.cancelOrder(order1.id, "BTCTUSD");
          console.log(
            `Order ${cancel_order.id} canceled due to timeout.`,
            cancel_order
          );
          await new Promise((resolve) => setTimeout(resolve, 10000));
          await buy(
            "BTC/TUSD",
            initial_investment_in_USD,
            profit_per,
            stop_loss_per,
            indicator_timeframe,
            apiKey,
            secret
            //flag
          );
        } else if (orderStatus.filled === orderStatus.amount) {
          console.log(`Order filled successfully.`, orderStatus);
          await waitForSell(
            "BTC/TUSD",
            orderStatus.amount,
            orderStatus.price,
            profit_per,
            stop_loss_per,
            indicator_timeframe,
            initial_investment_in_USD,
            apiKey,
            secret
            //flag
          );
        }
      }
      resolve(true);
    } catch (error) {
      console.log(error);
      const symbol = "BTC/TUSD"; // Replace with the trading pair you're interested in
      const limit = 1; // Number of orders to fetch, set to 1 to get the latest order
      if (error.message.includes("Unknown order sent")) {
        console.log("unknown order sent");
        await new Promise((resolve) => setTimeout(resolve, 65000));
        const orders = await binance.fetchMyTrades(symbol, undefined, limit);
        if (orders.side === "buy" && orders.status === "canceled") {
          console.log("latest order is canceled");
          await new Promise((resolve) => setTimeout(resolve, 10000));

          await buy(
            "BTC/TUSD",
            initial_investment_in_USD,
            profit_per,
            stop_loss_per,
            indicator_timeframe,
            apiKey,
            secret
            //flag
          );
        } else if (orders.side === "buy" && orders.status === "closed") {
          console.log("latest order is closed");
          await new Promise((resolve) => setTimeout(resolve, 10000));
          await waitForSell(
            symbol,
            orders.amount,
            orders.price,
            profit_per,
            stop_loss_per,
            indicator_timeframe,
            initial_investment_in_USD,
            apiKey,
            secret
            //flag
          );
        } else if (orders.side === "sell") {
          await new Promise((resolve) => setTimeout(resolve, 10000));

          await buy(
            "BTC/TUSD",
            initial_investment_in_USD,
            profit_per,
            stop_loss_per,
            indicator_timeframe,
            apiKey,
            secret
            //flag
          );
        }
      } else if (error.message.includes("request times out")) {
        console.log("request times out");

        await new Promise((resolve) => setTimeout(resolve, 65000));
        let orderstatus = await binance.fetchOpenOrders("BTC/TUSD");
        while (orderstatus.length != 0) {
          console.log("some open orders out there, wait..");
          orderstatus = await binance.fetchOpenOrders("BTC/TUSD");

          if (orderstatus.length === 0) {
            console.log("order status length is 0");
            const orders = await binance.fetchMyTrades(
              symbol,
              undefined,
              limit
            );

            if (orders.side === "buy") {
              await new Promise((resolve) => setTimeout(resolve, 10000));
              await waitForSell(
                symbol,
                orders.amount,
                orders.price,
                profit_per,
                stop_loss_per,
                indicator_timeframe,
                initial_investment_in_USD,
                apiKey,
                secret
                //flag
              );
            } else if (orders.side === "sell") {
              await new Promise((resolve) => setTimeout(resolve, 10000));

              await buy(
                "BTC/TUSD",
                initial_investment_in_USD,
                profit_per,
                stop_loss_per,
                indicator_timeframe,
                apiKey,
                secret
                //flag
              );
            }
          }
          await new Promise((resolve) => setTimeout(resolve, 10000));
        }
        if (orderstatus.length === 0) {
          const orders = await binance.fetchMyTrades(symbol, undefined, limit);

          if (orders.side === "buy") {
            await new Promise((resolve) => setTimeout(resolve, 10000));
            await waitForSell(
              symbol,
              orders.amount,
              orders.price,
              profit_per,
              stop_loss_per,
              indicator_timeframe,
              initial_investment_in_USD,
              apiKey,
              secret
              //flag
            );
          } else if (orders.side === "sell") {
            console.log("inside sell");
            await new Promise((resolve) => setTimeout(resolve, 10000));

            await buy(
              "BTC/TUSD",
              initial_investment_in_USD,
              profit_per,
              stop_loss_per,
              indicator_timeframe,
              apiKey,
              secret
              //flag
            );
          }
        }
      } else {
        console.error(error);
      }
    }
  });
}

//waiting for sell order
async function waitForSell(
  symbol,
  order_amount,
  order_price,
  profit_per,
  stop_loss_per,
  indicator_timeframe,
  initial_investment_in_USD,
  apiKey,
  secret
  //flag
) {
  const user = await userModel.findOne({ apiKey });
  const flag = user.status;
  console.log("waitforsell flag", flag);
  try {
    // const user = await userModel.findOne({ apiKey });
    // flag = user.status;
    // console.log("flag status", flag);
    if (flag) {
      //apiKey = req.user.apiKey;
      //secret = req.user.secret;

      const binance = new ccxt.binance({
        apiKey,
        secret,
        timeout: 30000,
      });
      await new Promise((resolve) => setTimeout(resolve, 2000));
      let curr_price = await binance.fetchTicker(`${symbol}`);

      curr_price = curr_price.ask;
      let ask_percent = (order_price * profit_per) / 100;
      let ask_price = ask_percent + order_price;

      let stopLoss_percent = (order_price * stop_loss_per) / 100;
      let stopLoss_price = order_price - stopLoss_percent;

      if (curr_price < ask_price && curr_price > stopLoss_price) {
        console.log(
          "Current price is less than ask price and greater than stoploss price\n"
        );
        while (curr_price < ask_price && curr_price > stopLoss_price) {
          await new Promise((resolve) => setTimeout(resolve, 3000));

          await waitForSell(
            symbol,
            order_amount,
            order_price,
            profit_per,
            stop_loss_per,
            indicator_timeframe,
            initial_investment_in_USD,
            apiKey,
            secret
            //flag
          );
        }
      } else if (curr_price <= stopLoss_price) {
        console.log("Current price falls below stoploss price. \n");
        //either we can call indicators or directly sell
        await stopLossSell(
          "BTC/TUSD",
          order_amount,
          indicator_timeframe,
          initial_investment_in_USD,
          profit_per,
          stop_loss_per,
          apiKey,
          secret
          //flag
        );
      } else if (curr_price >= ask_price) {
        console.log("Current price reach to the expected price\n");
        await sell(
          "BTC/TUSD",
          order_amount,
          ask_price,
          profit_per,
          stop_loss_per,
          indicator_timeframe,
          initial_investment_in_USD,
          apiKey,
          secret
          //flag
        );
      }
    }
  } catch (error) {
    console.log(error);
    if (
      error.message.includes("request times out") ||
      error.message.includes("Unknown order sent.") ||
      error
    ) {
      const symbol = "BTC/TUSD"; // Replace with the trading pair you're interested in
      const limit = 1; // Number of orders to fetch, set to 1 to get the latest order
      await new Promise((resolve) => setTimeout(resolve, 60000));
      let orderstatus = await binance.fetchOpenOrders("BTC/TUSD");
      while (orderstatus.length != 0) {
        console.log("some open orders out there, wait..");
        orderstatus = await binance.fetchOpenOrders("BTC/TUSD");
        if (orderstatus.length === 0) {
          const orders = await binance.fetchMyTrades(symbol, undefined, limit);

          if (orders.side === "buy") {
            await new Promise((resolve) => setTimeout(resolve, 10000));
            await waitForSell(
              symbol,
              orders.amount,
              orders.price,
              profit_per,
              stop_loss_per,
              indicator_timeframe,
              initial_investment_in_USD,
              apiKey,
              secret
              //flag
            );
          } else if (orders.side === "sell") {
            await new Promise((resolve) => setTimeout(resolve, 10000));

            await buy(
              "BTC/TUSD",
              initial_investment_in_USD,
              profit_per,
              stop_loss_per,
              indicator_timeframe,
              apiKey,
              secret
              //flag
            );
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 10000));
      }
      if (orderstatus.length === 0) {
        const orders = await binance.fetchMyTrades(symbol, undefined, limit);

        if (orders.side === "buy") {
          await new Promise((resolve) => setTimeout(resolve, 10000));
          await waitForSell(
            symbol,
            orders.amount,
            orders.price,
            profit_per,
            stop_loss_per,
            indicator_timeframe,
            initial_investment_in_USD,
            apiKey,
            secret
            //flag
          );
        } else if (orders.side === "sell") {
          await new Promise((resolve) => setTimeout(resolve, 10000));

          await buy(
            "BTC/TUSD",
            initial_investment_in_USD,
            profit_per,
            stop_loss_per,
            indicator_timeframe,
            apiKey,
            secret
            //flag
          );
        }
      }
    } else {
      console.error(error);
    }
  }
}

//to execute market sell when current price reaches to stop-loss price
async function stopLossSell(
  symbol,
  order_amount,
  indicator_timeframe,
  initial_investment_in_USD,
  profit_per,
  stop_loss_per,
  apiKey,
  secret
  //flag
) {
  const user = await userModel.findOne({ apiKey });
  const flag = user.status;
  console.log("stopLossSell flag", flag);
  try {
    if (flag) {
      //apiKey = req.user.apiKey;
      //secret = req.user.secret;

      const binance = new ccxt.binance({
        apiKey,
        secret,
        timeout: 30000,
      });
      let symbol_pair = symbol;

      let amount = order_amount;

      const order2 = await binance.createOrder(
        `${symbol_pair}`,
        "market",
        "sell",
        amount
      );

      let orderStatus = await binance.fetchOrder(order2.id, "BTCTUSD");
      while (orderStatus.filled != orderStatus.amount) {
        // Sleep for a short interval (e.g., 1 second) before checking again

        // Check the order status again
        orderStatus = await binance.fetchOrder(order2.id, "BTCTUSD");
        if (orderStatus.filled === orderStatus.amount) {
          console.log(`Order completely filled.`, orderStatus);
          //restart the bot
          await new Promise((resolve) => setTimeout(resolve, 5000));
          console.log("calling indicator");

          await calculate(
            "BTC/TUSD",
            indicator_timeframe,
            initial_investment_in_USD,
            profit_per,
            stop_loss_per,
            apiKey,
            secret
            //flag
          );
        }
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
      if (orderStatus.filled === orderStatus.amount) {
        console.log(`Order completely filled.`, orderStatus);
        //restart the bot
        await new Promise((resolve) => setTimeout(resolve, 5000));
        console.log("calling indicator");
        await calculate(
          "BTC/TUSD",
          indicator_timeframe,
          initial_investment_in_USD,
          profit_per,
          stop_loss_per,
          apiKey,
          secret
          //flag
        );
      }
    }
  } catch (error) {
    console.log(error);
    const symbol = "BTC/TUSD"; // Replace with the trading pair you're interested in
    const limit = 1; // Number of orders to fetch, set to 1 to get the latest order
    if (
      error.message.includes("request times out") ||
      error.message.includes("Unknown order sent.") ||
      error
    ) {
      await new Promise((resolve) => setTimeout(resolve, 60000));
      let orderstatus = await binance.fetchOpenOrders("BTC/TUSD");
      while (orderstatus.length != 0) {
        console.log("some open orders out there, wait..");
        orderstatus = await binance.fetchOpenOrders("BTC/TUSD");
        if (orderstatus.length === 0) {
          const orderStatus = await binance.fetchMyTrades(
            symbol,
            undefined,
            limit
          );
          if (orderStatus.side === "buy") {
            await new Promise((resolve) => setTimeout(resolve, 10000));
            await stopLossSell(
              symbol,
              orderStatus.amount,
              indicator_timeframe,
              initial_investment_in_USD,
              profit_per,
              stop_loss_per,
              apiKey,
              secret
              //flag
            );
          } else if (orderStatus.side === "sell") {
            await new Promise((resolve) => setTimeout(resolve, 10000));

            await calculate(
              "BTC/TUSD",
              indicator_timeframe,
              initial_investment_in_USD,
              profit_per,
              stop_loss_per,
              apiKey,
              secret
              //flag
            ); // Recursively call the function
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 10000));
      }
      if (orderstatus.length === 0) {
        const orderStatus = await binance.fetchMyTrades(
          symbol,
          undefined,
          limit
        );
        if (orderStatus.side === "buy") {
          await new Promise((resolve) => setTimeout(resolve, 10000));
          await stopLossSell(
            symbol,
            orderStatus.amount,
            indicator_timeframe,
            initial_investment_in_USD,
            profit_per,
            stop_loss_per,
            apiKey,
            secret
            //flag
          );
        } else if (orderStatus.side === "sell") {
          await new Promise((resolve) => setTimeout(resolve, 10000));

          await calculate(
            "BTC/TUSD",
            indicator_timeframe,
            initial_investment_in_USD,
            profit_per,
            stop_loss_per,
            apiKey,
            secret
            //flag
          ); // Recursively call the function
        }
      }
    } else {
      console.error("Error:", error);
    }
  }
}

//to sell tokens
async function sell(
  symbol,
  order_amount,
  price,
  profit_per,
  stop_loss_per,
  indicator_timeframe,
  initial_investment_in_USD,
  apiKey,
  secret
  //flag
) {
  const user = await userModel.findOne({ apiKey });
  const flag = user.status;
  console.log("stopLossSell flag", flag);
  try {
    if (flag) {
      //apiKey = req.user.apiKey;
      //secret = req.user.secret;

      const binance = new ccxt.binance({
        apiKey,
        secret,
        timeout: 30000,
      });
      let symbol_pair = symbol;

      let amount = order_amount;
      let token_price = price;

      const order2 = await binance.createOrder(
        `${symbol_pair}`,
        "limit",
        "sell",
        amount,
        token_price
      );

      let orderStatus = await binance.fetchOrder(order2.id, "BTCTUSD");

      while (orderStatus.filled != orderStatus.amount) {
        // Sleep for a short interval (e.g., 1 second) before checking again

        // Check the order status again
        orderStatus = await binance.fetchOrder(order2.id, "BTCTUSD");
        if (orderStatus.filled === orderStatus.amount) {
          console.log(`Order completely filled.`, orderStatus);
          //restart the bot
          await new Promise((resolve) => setTimeout(resolve, 10000));

          await buy(
            "BTC/TUSD",
            initial_investment_in_USD,
            profit_per,
            stop_loss_per,
            indicator_timeframe,
            apiKey,
            secret
            //flag
          );
        }
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
      if (orderStatus.filled === orderStatus.amount) {
        console.log(`Order completely filled.`, orderStatus);
        //restart the bot
        await new Promise((resolve) => setTimeout(resolve, 10000));

        await buy(
          "BTC/TUSD",
          initial_investment_in_USD,
          profit_per,
          stop_loss_per,
          indicator_timeframe,
          apiKey,
          secret
          //flag
        );
      }
    }
  } catch (error) {
    console.log(error);
    if (
      error.message.includes("request times out") ||
      error.message.includes("Unknown order sent.") ||
      error
    ) {
      const symbol = "BTC/TUSD"; // Replace with the trading pair you're interested in
      const limit = 1; // Number of orders to fetch, set to 1 to get the latest order
      await new Promise((resolve) => setTimeout(resolve, 60000));
      let orderstatus = await binance.fetchOpenOrders("BTC/TUSD");
      while (orderstatus.length != 0) {
        console.log("some open orders out there, wait..");
        orderstatus = await binance.fetchOpenOrders("BTC/TUSD");
        if (orderstatus.length === 0) {
          const orders = await binance.fetchMyTrades(symbol, undefined, limit);
          //console.log("Latest executed order:", orders[0]);
          if (orders.side === "buy") {
            await new Promise((resolve) => setTimeout(resolve, 10000));
            await sell(
              symbol,
              orders.amount,
              orders.price,
              profit_per,
              stop_loss_per,
              indicator_timeframe,
              apiKey,
              secret
              //flag
            );
          } else if (orders.side === "sell") {
            await new Promise((resolve) => setTimeout(resolve, 10000));
            //process.exit(0);
            await buy(
              "BTC/TUSD",
              initial_investment_in_USD,
              profit_per,
              stop_loss_per,
              indicator_timeframe,
              apiKey,
              secret
              //flag
            );
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 10000));
      }
      if (orderstatus.length === 0) {
        const orders = await binance.fetchMyTrades(symbol, undefined, limit);

        if (orders.side === "buy") {
          await new Promise((resolve) => setTimeout(resolve, 10000));
          await sell(
            symbol,
            orders.amount,
            orders.price,
            profit_per,
            stop_loss_per,
            indicator_timeframe,
            apiKey,
            secret
            //flag
          );
        } else if (orders.side === "sell") {
          await new Promise((resolve) => setTimeout(resolve, 10000));

          await buy(
            "BTC/TUSD",
            initial_investment_in_USD,
            profit_per,
            stop_loss_per,
            indicator_timeframe,
            apiKey,
            secret
            //flag
          );
        }
      }
    } else {
      console.error(error);
    }
  }
}

//Indicator
async function getCandles(symbol, timeframe) {
  //apiKey = req.user.apiKey;
  //secret = req.user.secret;

  const binance = new ccxt.binance({
    apiKey,
    secret,
    timeout: 30000,
  });
  const candles = await binance.fetchOHLCV(symbol, timeframe);
  const hlc3 = candles.map((candle) => (candle[4] + candle[3] + candle[2]) / 3);
  const high = candles.map((candle) => candle[2]);
  const low = candles.map((candle) => candle[3]);
  const close = candles.map((candle) => candle[4]);
  return hlc3, high, low, close;
}

function RMA(src, length) {
  const alpha = 1 / length;
  let sum = 0.0;
  if (typeof sum[1] === "undefined") {
    sum = ta.sma(src, length);
  } else {
    sum = alpha * src + (1 - alpha) * sum[1];
  }
  return sum;
}

async function calculate(
  symbol,
  indicator_timeframe,
  initial_investment_in_USD,
  profit_per,
  stop_loss_per,
  apiKey,
  secret
  //flag
) {
  const user = await userModel.findOne({ apiKey });
  const flag = user.status;
  console.log("calculate flag", flag);
  try {
    if (flag) {
      //apiKey = req.user.apiKey;
      //secret = req.user.secret;

      const binance = new ccxt.binance({
        apiKey,
        secret,
        timeout: 30000,
      });
      const exchange = new ccxt.binance({
        timeframe: false,
      });
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const candles = await exchange.fetchOHLCV(symbol, indicator_timeframe);
      // const candles = candles2.reverse();

      //console.log(candles);
      const hlc3 = candles.map(
        (candle) => (candle[4] + candle[3] + candle[2]) / 3
      );
      const high = candles.map((candle) => candle[2]);
      const low = candles.map((candle) => candle[3]);
      const clos = candles.map((candle) => candle[4]);

      const src = hlc3; // Replace hlc3 with your actual data array
      const FracPoints = "3pt";
      const FracType = "outer";
      const FracDirMethod = "range";
      const TrendDirMethod = "consec";
      const length = 10;
      const stoch = TechnicalIndicators.Stochastic.calculate({
        high: high,
        low: low,
        close: src,
        period: length,
      });

      const smaStoch = TechnicalIndicators.SMA.calculate({
        values: stoch.map((s) => s.d),
        period: 3,
      });

      const emaStoch1 = TechnicalIndicators.EMA.calculate({
        values: smaStoch,
        period: 3,
      });

      const emaStoch2 = TechnicalIndicators.EMA.calculate({
        values: smaStoch,
        period: 4,
      });

      const emaStoch3 = TechnicalIndicators.EMA.calculate({
        values: smaStoch,
        period: 5,
      });

      const emaStoch4 = TechnicalIndicators.EMA.calculate({
        values: smaStoch,
        period: 6,
      });

      const emaStoch5 = TechnicalIndicators.EMA.calculate({
        values: smaStoch,
        period: 7,
      });

      const emaStoch6 = TechnicalIndicators.EMA.calculate({
        values: smaStoch,
        period: 8,
      });

      const emaStoch7 = TechnicalIndicators.EMA.calculate({
        values: smaStoch,
        period: 9,
      });

      const emaStoch8 = TechnicalIndicators.EMA.calculate({
        values: smaStoch,
        period: 10,
      });

      const k1 = emaStoch1[emaStoch1.length - 1];
      const k2 = emaStoch2[emaStoch2.length - 1];
      const k3 = emaStoch3[emaStoch3.length - 1];
      const k4 = emaStoch4[emaStoch4.length - 1];
      const k5 = emaStoch5[emaStoch5.length - 1];
      const k6 = emaStoch6[emaStoch6.length - 1];
      const k7 = emaStoch7[emaStoch7.length - 1];
      const k8 = emaStoch8[emaStoch8.length - 1];

      const fastMA = 15;
      const slowMA = 34;
      const smoothing = 9;
      const sLine = true;
      const MACD_visible = true;
      const OsMA_histogram = true;

      const macd = TechnicalIndicators.MACD.calculate({
        values: clos,
        fastPeriod: fastMA,
        slowPeriod: slowMA,
        signalPeriod: smoothing,
      });
      const signalLine = macd.map((s) => s.signal);
      const MACD = macd.map((s) => s.MACD);

      const sl = sLine ? signalLine : undefined;

      const OsMA = MACD.map((x) => parseFloat(x)).map((v, n) => {
        return MACD[n] - signalLine[n];
      });

      const src1 = clos;
      const len = 10;
      const len2 = 10;

      const change = src1.map((value, index, array) =>
        index === 0 ? 0 : value - array[index - 1]
      );
      const up_values = change.map((value) => Math.max(value, 0));
      const down_values = change.map((value) => -Math.min(value, 0));
      const up = TechnicalIndicators.EMA.calculate({
        values: up_values,
        period: len,
      });
      const down = TechnicalIndicators.EMA.calculate({
        values: down_values,
        period: len,
      });
      const rsi = down.map((value, index) => {
        if (value === 0) return 100;
        if (up[index] === 0) return 0;
        return 100 - 100 / (1 + up[index] / down[index]);
      });

      const emaRSI = TechnicalIndicators.EMA.calculate({
        values: rsi,
        period: len2,
      });
      // Direction
      BOTH = 2;
      UP = 1;
      NONE = 0;
      DOWN = -1;

      let fracHigh = [];
      let fracLow = [];
      let lag = 0;
      let fracDual = [];

      if (FracPoints === "3pt") {
        lag = 1;

        if (FracType === "outer") {
          fracHigh = high
            .map((x) => parseFloat(x))
            .map((v, n) => {
              return high[n - 2] <= high[n - 1] && high[n - 1] > high[n];
            });
          fracLow = low
            .map((x) => parseFloat(x))
            .map((v, n) => {
              return low[n - 2] >= low[n - 1] && low[n - 1] < low[n];
            });
        }
        if (FracType == "inner") {
          fracHigh = high
            .map((x) => parseFloat(x))
            .map((v, n) => {
              return high[n - 2] >= high[n - 1] && high[n - 1] < high[n];
            });
          fracLow = low
            .map((x) => parseFloat(x))
            .map((v, n) => {
              return low[n - 2] <= low[n - 1] && low[n - 1] > low[n];
            });
        }
      }
      if (FracPoints == "s3pt") {
        lag = 1;
        if (FracType == "outer") {
          fracHigh = high
            .map((x) => parseFloat(x))
            .map((v, n) => {
              return high[n - 2] < high[n - 1] && high[n - 1] > high[n];
            });
          fracLow = low
            .map((x) => parseFloat(x))
            .map((v, n) => {
              return low[n - 2] > low[n - 1] && low[n - 1] < low[n];
            });
        }
        if (FracType == "inner") {
          fracHigh = high
            .map((x) => parseFloat(x))
            .map((v, n) => {
              return high[n - 2] > high[n - 1] && high[n - 1] < high[n];
            });
          fracLow = low
            .map((x) => parseFloat(x))
            .map((v, n) => {
              return low[n - 2] < low[n - 1] && low[n - 1] > low[n];
            });
        }
      }
      if (FracPoints == "5pt") {
        lag = 2;
        if (FracType == "outer") {
          fracHigh = high
            .map((x) => parseFloat(x))
            .map((v, n) => {
              return (
                high[n - 4] <= high[n - 2] &&
                high[n - 3] <= high[n - 2] &&
                high[n - 2] > high[n - 1] &&
                high[n - 2] > high[n]
              );
            });
          fracLow = low
            .map((x) => parseFloat(x))
            .map((v, n) => {
              return (
                low[n - 4] >= low[n - 2] &&
                low[n - 3] >= low[n - 2] &&
                low[n - 2] < low[n - 1] &&
                low[n - 2] < low[n]
              );
            });
        }
        if (FracType == "inner") {
          fracHigh = high
            .map((x) => parseFloat(x))
            .map((v, n) => {
              return (
                high[n - 4] >= high[n - 2] &&
                high[n - 3] >= high[n - 2] &&
                high[n - 2] < high[n - 1] &&
                high[n - 2] < high[n]
              );
            });
          fracLow = low
            .map((x) => parseFloat(x))
            .map((v, n) => {
              return (
                low[n - 4] <= low[n - 2] &&
                low[n - 3] <= low[n - 2] &&
                low[n - 2] > low[n - 1] &&
                low[n - 2] > low[n]
              );
            });
        }
      }
      if (FracPoints == "bw5pt") {
        lag = 2;
        if (FracType == "outer") {
          fracHigh = high
            .map((x) => parseFloat(x))
            .map((v, n) => {
              return (
                high[n - 4] < high[n - 2] &&
                high[n - 3] <= high[n - 2] &&
                high[n - 2] >= high[n - 1] &&
                high[n - 2] > high[n]
              );
            });
          fracLow = low
            .map((x) => parseFloat(x))
            .map((v, n) => {
              return (
                low[n - 4] > low[n - 2] &&
                low[n - 3] >= low[n - 2] &&
                low[n - 2] <= low[n - 1] &&
                low[n - 2] < low[n]
              );
            });
        }
        if (FracType == "inner") {
          fracHigh = high
            .map((x) => parseFloat(x))
            .map((v, n) => {
              return (
                high[n - 4] > high[n - 2] &&
                high[n - 3] > high[n - 2] &&
                high[n - 2] <= high[n - 1] &&
                high[n - 2] < high[n]
              );
            });
          fracLow = low
            .map((x) => parseFloat(x))
            .map((v, n) => {
              return (
                low[n - 4] < low[n - 2] &&
                low[n - 3] <= low[n - 2] &&
                low[n - 2] >= low[n - 1] &&
                low[n - 2] > low[n]
              );
            });
        }
      }
      if (FracPoints == "s5pt") {
        lag = 2;
        if (FracType == "outer") {
          fracHigh = high
            .map((x) => parseFloat(x))
            .map((v, n) => {
              return (
                high[n - 4] < high[n - 3] &&
                high[n - 3] < high[n - 2] &&
                high[n - 2] > high[n - 1] &&
                high[n - 1] > high[n]
              );
            });
          fracLow = low
            .map((x) => parseFloat(x))
            .map((v, n) => {
              return (
                low[n - 4] > low[n - 3] &&
                low[n - 3] > low[n - 2] &&
                low[n - 2] < low[n - 1] &&
                low[n - 1] < low[n]
              );
            });
        }
        if (FracType == "inner") {
          fracHigh = high
            .map((x) => parseFloat(x))
            .map((v, n) => {
              return (
                high[n - 4] > high[n - 3] &&
                high[n - 3] > high[n - 2] &&
                high[n - 2] < high[n - 1] &&
                high[n - 1] < high[n]
              );
            });
          fracLow = low
            .map((x) => parseFloat(x))
            .map((v, n) => {
              return (
                low[n - 4] < low[n - 3] &&
                low[n - 3] < low[n - 2] &&
                low[n - 2] > low[n - 1] &&
                low[n - 1] > low[n]
              );
            });
        }
      }
      fracDual = fracHigh && fracLow;
      // Fractal levels
      let fracLevelHigh = [];
      let fracLevelLow = [];

      for (let i = 0; i < clos.length; i++) {
        const fracHighvalue = fracHigh[i]; // Function to determine if it's a fractal high
        const fracLowvalue = fracLow[i]; // Function to determine if it's a fractal low

        const highLag = i >= lag ? high[i - lag] : high[i];
        const lowLag = i >= lag ? low[i - lag] : low[i];

        const prevFracLevelHigh = i > 0 ? fracLevelHigh[i - 1] : high[i];
        const prevFracLevelLow = i > 0 ? fracLevelLow[i - 1] : low[i];

        const currentFracLevelHigh = fracHighvalue
          ? highLag
          : prevFracLevelHigh;
        const currentFracLevelLow = fracLowvalue ? lowLag : prevFracLevelLow;

        fracLevelHigh.push(currentFracLevelHigh);
        fracLevelLow.push(currentFracLevelLow);
      }

      const buy_breakout_all = clos
        .map((x) => parseFloat(x))
        .map((v, n) => {
          return (
            clos[n] > fracLevelHigh[n] &&
            OsMA[n - 1] > OsMA[n - 2] &&
            emaRSI[n - 1] > emaRSI[n - 2]
          );
        });
      const sell_breakout_all = clos
        .map((x) => parseFloat(x))
        .map((v, n) => {
          return (
            clos[n] < fracLevelLow[n] &&
            OsMA[n - 1] < OsMA[n - 2] &&
            emaRSI[n - 1] < emaRSI[n - 2]
          );
        });
      //fracLevelHigh = fracHigh ? talib.nz(high[lag], high) : talib.nz(fracLevelHigh[1], high)
      //fracLevelLow = fracLow ? talib.nz(low[lag], low) : talib.nz(fracLevelLow[1], low)
      const buy_breakout =
        clos[clos.length - 1] > fracLevelHigh[fracLevelHigh.length - 1] &&
        OsMA[OsMA.length - 2] > OsMA[OsMA.length - 3] &&
        emaRSI[emaRSI.length - 2] > emaRSI[emaRSI.length - 3];
      const sell_breakout =
        clos[clos.length - 1] < fracLevelLow[fracLevelLow.length - 1] &&
        OsMA[OsMA.length - 2] < OsMA[OsMA.length - 3] &&
        emaRSI[emaRSI.length - 2] < emaRSI[emaRSI.length - 3];

      console.log("Buy Suggestion", buy_breakout);
      console.log("Sell Suggestion", sell_breakout, "\n");

      buy_signal = buy_breakout;
      sell_signal = sell_breakout;

      //const buy_order = await buy("BTC/TUSD", initial_investment_in_USD);
      await checkBuySignal(
        buy_signal,
        //flag,
        initial_investment_in_USD,
        profit_per,
        stop_loss_per,
        indicator_timeframe,
        apiKey,
        secret
        //flag
      );
    }
    //await new Promise((resolve) => setTimeout(resolve, 3000));
  } catch (error) {
    console.log(error);
    // if (err instanceof ccxt.NetworkError && err.message.includes("timed")) {
    //   console.log("Retrying...");
    //   await new Promise((resolve) => setTimeout(resolve, 2000));
    //   await sleep(2000); // Wait for a moment before retrying
    //   await binance.fetchTicker("BTC/USDT");
    // }
    if (error.message.includes("request timed out") || error) {
      console.log("Calculate Request timed out. Retrying...");
      await new Promise((resolve) => setTimeout(resolve, 60000));

      await calculate(
        "BTC/TUSD",
        indicator_timeframe,
        initial_investment_in_USD,
        profit_per,
        stop_loss_per,
        apiKey,
        secret
        //flag
      );
    }
  }
}

//to check signal status
async function checkBuySignal(
  buy_signal,
  //flag,
  initial_investment_in_USD,
  profit_per,
  stop_loss_per,
  indicator_timeframe,
  apiKey,
  secret
  //flag
) {
  const user = await userModel.findOne({ apiKey });
  const flag = user.status;
  console.log("calculate flag", flag);
  try {
    if (flag) {
      if (buy_signal === true && flag === true) {
        console.log("Buy BTC");
        await buy(
          "BTC/TUSD",
          initial_investment_in_USD,
          profit_per,
          stop_loss_per,
          indicator_timeframe,
          apiKey,
          secret
          //flag
        );
      } else if (buy_signal === false || flag === true) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        await calculate(
          "BTC/TUSD",
          indicator_timeframe,
          initial_investment_in_USD,
          profit_per,
          stop_loss_per,
          apiKey,
          secret
          //flag
        );
      }
    }
  } catch (error) {
    console.log(err);
    if (error.message.includes("request timed out") || error) {
      console.log("checkBuySignal Request timed out. Retrying... ");
      await new Promise((resolve) => setTimeout(resolve, 60000));
      await calculate(
        "BTC/TUSD",
        indicator_timeframe,
        initial_investment_in_USD,
        profit_per,
        stop_loss_per,
        apiKey,
        secret
        //flag
      );
    } else {
      console.error("Error:", error);
    }
  }
}

//app listening on port-
app.listen(8000, () => {
  console.log("Listening on Port 8000");
});
