import express from "express";
// const colors = require('colors');
import morgan from "morgan"
import dotenv from "dotenv"
import { MongoClient, ObjectId } from 'mongodb';
import braintree from "braintree";

// import mongoose from "mongoose";
import authroute from "./routes/authroute.js"
import categoryroutes from "./routes/categoryroutes.js"
import productroutes from "./routes/productroutes.js"
import cors from "cors";
import bodyParser from 'body-parser';
import path from "path";
const app = express();



app.use(bodyParser.json({ limit: '50mb' }));




import connectDB from "./config/db.js";
import ProductModel from "./models/ProductModel.js";
import OrderModel from "./models/OrderModel.js";
import requireSignIn from "./middlewares/authMiddleware.js";



//  config
dotenv.config()
// cors
app.use(cors());
// databasee config
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', 'http://localhost:3000');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
  });




//   app.use(cors({
//     origin: 'http://localhost:3000',  // Allow only requests from this origin
//     methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
//     credentials: true  // Allow credentials (e.g., cookies, authorization headers)
//   }));
app.use(cors({ origin: 'http://localhost:3000' }));
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200); // Respond to OPTIONS requests with OK status
  } else {
    next();
  }
});
connectDB();

// middleware
app.use(morgan('dev'))
app.use(express.json())


const __dirname = path.dirname(new URL(import.meta.url).pathname);

const staticPath = path.join(__dirname, './my-app/build');

app.use(express.static(staticPath));



console.log(__dirname, './my-app/build');

// routes
app.use('/api/v1/auth',authroute );
app.use('/api/v1/category', categoryroutes);
app.use('/api/v1/product', productroutes);

//payment gateway
// payment gateway
var gateway = new braintree.BraintreeGateway({
  environment: braintree.Environment.Sandbox,
  merchantId: process.env.BRAINTREE_MERCHANT_ID,
  publicKey: process.env.BRAINTREE_PUBLIC_KEY,
  privateKey:process.env. BRAINTREE_PRIVATE_KEY,
});

// rest api 
// app.get('/', (req, res) => {
//   res.sendFile(path.join(staticPath, 'index.html'));
// });

app.use('*',function(req,res){
  res.sendFile(path.join(__dirname,'../my-app/build/index.html'));

});

app.post('/filters', async (req, res) => {
    try {
      const {  radio } = req.body;
      let args = {};
      
    //   Convert the checked array elements to ObjectId
      // const categoryIds = checked.map(id => new ObjectId(id));
      
      // if (categoryIds.length > 0) args.category = { $in: categoryIds };
      if (radio.length) args.price = { $gte: radio[0], $lte: radio[1] };
  
      const products = await ProductModel.find(args);
      console.log(args);
      res.status(200).send({
        success: true,
        products,
      });
    } catch (error) {
      console.log(error);
      res.status(400).send({
        success: false,
        message: "Error While Filtering Products",
        error,
      });
    }
  });

  // app.post('/name', (req, res) => {
  //   const { name } = req.body;
  //   if (!name) {
  //     return res.status(400).send('Name is required');
  //   }
  //   res.send(`Hello, ${name}!`);
  // });
  app.post('/payment', requireSignIn, async(req,res) =>{
  
  try {
    const { nonce, cart } = req.body;
   
    let total = 0;
    cart.forEach((item) => {
      total += item.price;
    });

    // Wrap the transaction in a Promise
    const salePromise = new Promise((resolve, reject) => {
      gateway.transaction.sale(
        {
          amount: total,
          paymentMethodNonce: nonce,
          options: {
            submitForSettlement: true,
          },
        },
        function (error, result) {
          if (error) {
            reject(error);
          } else {
            resolve(result);
          }
        }
      );
    });

    // Wait for the transaction to complete
    const result = await salePromise;

    if (result.success) {
      // Ensure req.user._id is correctly populated
      if (!req.user || !req.user._id) {
        return res.status(400).json({ error: "User ID not provided" });
      }

      // Save order if transaction successful
      const order = new OrderModel({
        products: cart,
        payment: result,
        buyer: req.user._id,
      });

      const savedOrder = await order.save();

      return res.json({ success: true, order: savedOrder });
    } else {
      // Handle transaction failure
      return res.status(500).send(result.message);
    }
  } catch (error) {
    console.error("Error processing transaction:", error);
    return res.status(500).send("Error processing transaction");
  }

  })


// port
const PORT = process.env.PORT || 80;
// const port = 80;
app.listen(PORT, () =>{
    console.log(`server is running ${process.env.Dev_Mode} mode on ${PORT}`);
})


