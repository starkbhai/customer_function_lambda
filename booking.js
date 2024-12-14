const axios = require("axios");
const https = require("https");
require("dotenv").config();
const { v4: uuidv4 } = require("uuid");
const { DynamoDBDocument } = require("@aws-sdk/lib-dynamodb");
const { DynamoDB } = require("@aws-sdk/client-dynamodb");
const { Lambda } = require("@aws-sdk/client-lambda");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { GetObjectCommand, S3 } = require("@aws-sdk/client-s3");
const customerFile = require("./customer");
const messageTemplate = require("./push_notification_message_template");
const dynamo = () => DynamoDBDocument.from(new DynamoDB());
const lambda = () => new Lambda();
const s3 = () =>
  new S3({
    region: process.env.REGION,
    accessKeyId: process.env.ACCESS_KEY_ID,
    secretAccessKey: process.env.SECRET_ACCESS_KEY,
  });
const {
  getBookingTable,
  getCustomerTable,
  getSublocationsTable,
  getTicketTable,
} = require("./constants");
const {
  send_message_api,
  createTransaction,
  updateTransactionBookingDelete,
} = require("./apis");

async function queries(event) {
  console.log("event", event);
  let responseBody = {};
  let requestMethod = event.httpMethod;
  let customer_id = event.pathParameters.customer_id;
  try {
    switch (requestMethod) {
      case "GET":
        responseBody.bookings = await get_customer_bookings(customer_id);
        responseBody.customer_id = customer_id;
        responseBody.message =
          "Bookings of given customer fetched successfully";
        responseBody.is_success = true;
        break;

      case "POST":
        console.log("inside bookings POST");
        console.log(typeof event);
        let requestBody = JSON.parse(event.body);
        console.log(requestBody);
        let customer_details = await check_customer_presence(customer_id);
        console.log(customer_details);
        if (customer_details != null) {
          console.log("Customer Details is not null");
          let subLocationDetails = await fetchSubLocationDetails(
            requestBody.location_id,
            requestBody.sub_location_id
          );
          console.log("sublocation details", subLocationDetails);
          if (!requestBody.video_orientation) {
            requestBody.video_orientation =
              subLocationDetails?.video_orientation;
          }
          if (subLocationDetails?.payment_type === "free") {
              requestBody.transaction_id = "00000000-0000-0000-0000-000000000000";
          }
          responseBody.booking = await add_booking(customer_id, requestBody);
          if (requestBody.ticket_id) {
            const data = {
              booking_id: responseBody.booking.booking_id,
              sub_location_id: responseBody.booking.sub_location_id,
              active: false,
              customer_id: responseBody.booking.customer_id,
              customer_name: responseBody.booking.customer_name,
              phone_number: responseBody.booking.phone_number,
            };
            const updateTicketResponse = await updateTicketDetails(
              booking.ticket_id,
              data
            );
          }
          responseBody.message = "Booking added successfully. ";
          console.log(
            "fcm_registration_token:",
            customer_details?.registration_token
          );
          if (customer_details.registration_token != null) {
            let messageBody = messageTemplate.bookingCreatedMessage;
            messageBody.data.customer_id = customer_id;
            messageBody.data.customer_name = customer_details?.customer_name;
            messageBody.data.customer_email = customer_details?.customer_email;
            await customerFile.send_push_notification(
              customer_details.registration_token,
              messageBody
            );
            console.log("Push notification sent for creating booking");
          }
          requestBody.customer_id = customer_id;
          requestBody.booking_id = responseBody.booking.booking_id;
          requestBody.current_status = "SUCCESS";
          console.log("moving to update transaction");
          console.log(requestBody);
          if (
            requestBody.location_id == "f347809d-5700-5bec-fc1f-3b179ba42dd2"
          ) {
            const transaction_details = requestBody?.transaction_details;
            transaction_details.customers = [responseBody.booking];
            console.log("trasaction details to update", transaction_details);
            const createTransactionResponse = await createTransaction(
              transaction_details
            );
            console.log(
              "create transaction response",
              createTransactionResponse
            );
            let billing_number = createTransactionResponse?.data?.billing_number;
            requestBody.billing_number = billing_number;
          }
          if (
            requestBody.location_id == "f347809d-5700-5bec-fc1f-3b179ba42dd2"
          ) {
            // const qr_link = await get_short_link_amer(
            //   `https://www.droame.com/amber-fort/${responseBody.booking.booking_id}`
            // );
            const qr_link = `https://www.droame.com/amber-fort/${responseBody.booking.booking_id}`;
            console.log("customer portal link", qr_link);
            requestBody.qr_link = qr_link;
            responseBody.booking.qr_link = qr_link;
          }
          if (
            requestBody.location_id == "f347809d-5700-5bec-fc1f-3b179ba42dd2" ||
            subLocationDetails?.payment_type !== "pre_paid"
          ) {
            //condition for amer
            await add_shot_to_queue(
              customer_details,
              responseBody.booking,
              requestBody,
              event
            );
            if (
              requestBody.location_id == "f347809d-5700-5bec-fc1f-3b179ba42dd2"
            ) {
              let booking_details = {
                booking_id: responseBody.booking.booking_id,
                customer_id: responseBody.booking.customer_id,
                customer_name: responseBody.booking.customer_name,
                sub_location_name: responseBody.booking.sub_location_name,
                sub_location_id: responseBody.booking.sub_location_id,
                phone_number: responseBody.booking?.phone_number,
              };
              const sendSmsBody = {
                message_type: "booking_created",
                booking_details: booking_details,
              };
              await send_message_api(sendSmsBody);
              console.log("message send for booking creation");
            }
            responseBody.message += "Shot added to queue successfully";
          }

          responseBody.is_success = true;
        } else {
          responseBody.message = "Given Customer does not exist";
          responseBody.is_success = false;
        }
        break;
      default:
        throw new Error(`Unsupported method: "${requestMethod}"`);
    }
  } catch (err) {
    responseBody.is_success = false;
    responseBody.message += err.message;
  }
  return buildResponse(responseBody);
}

async function booking_queries(event) {
  let responseBody = {};
  let requestMethod = event.httpMethod;
  let customer_id = event.pathParameters.customer_id;
  let booking_id = event.pathParameters.booking_id;
  console.log("inside booking queries : ");
  console.log(event);
  console.log("request method :: " + requestMethod);
  try {
    switch (requestMethod) {
      case "GET":
        responseBody.shots = await get_booking_details(customer_id, booking_id);
        responseBody.customer_id = customer_id;
        responseBody.message = "Booking details fetched successfully";
        responseBody.is_success = true;
        break;

      case "PATCH":
        console.log("bookings PATCH method:");
        let requestBody = JSON.parse(event.body);
        console.log(requestBody);
        let customer = await check_customer_presence(customer_id);
        console.log("Customer = ", customer);
        if (
          requestBody.s3Bucket != null &&
          requestBody.s3Key != null &&
          requestBody.video_uri == null &&
          requestBody.action == "video_uploaded"
        ) {
          console.log("Generating presigned url");
          const signedUrl = await getSignedUrl(
            s3(),
            new GetObjectCommand({
              Bucket: requestBody.s3Bucket,
              Key: requestBody.s3Key,
            }),
            {
              expiresIn: 604800,
            }
          );
          console.log(`Pre-signed URL generated: ${signedUrl}`);

          if (endsWithZip(requestBody.s3Key)) {
            requestBody.zip_url_s3 = signedUrl;
            requestBody.action = "";
            console.log("customer id", customer_id);
            console.log("booking id", booking_id);
          } else {
            requestBody.video_uri_s3 = signedUrl;
          }
        }

        console.log(
          "Zip url image to be updated is",
          requestBody.zip_url_s3Image
        );
        console.log("Zip url videos to be updated is", requestBody.zip_url_s3);

        if (
          requestBody.zip_url_s3Image != null ||
          requestBody.zip_url_s3 != null
        ) {
          console.log("updating image url");
          await update_booking_details(customer_id, booking_id, requestBody); // for updating zip link after uploading to s3
        }

        if (
          requestBody.video_uri != null &&
          requestBody.action === "video_uploaded"
        ) {
          console.log("Proceeding to get short link");
          let short_link = await get_short_link(requestBody.video_uri);
          console.log("Short link obtained is : " + short_link);
          requestBody.short_video_uri = short_link;
        } else if (
          requestBody.video_uri_wasabi != null &&
          requestBody.action === "video_uploaded"
        ) {
          console.log("Proceeding to get short link");
          let short_link = await get_short_link(requestBody.video_uri_wasabi);
          console.log("Short link obtained is : " + short_link);
          requestBody.short_video_uri = short_link;
        } else if (
          requestBody.video_uri_s3 != null &&
          requestBody.action === "video_uploaded"
        ) {
          console.log("Proceeding to get short link");
          let short_link = await get_short_link(requestBody.video_uri_s3);
          console.log("Short link obtained is : " + short_link);
          requestBody.short_video_uri = short_link;
        }
        await update_booking_details(customer_id, booking_id, requestBody);
        console.log("Short_video_uri updated successfully in dynamo db");
        console.log(requestBody);
        responseBody.booking = await get_booking_details(
          customer_id,
          booking_id
        );
        requestBody.booking_details = responseBody?.booking;
        responseBody.message = "Booking updated successfully";
        console.log(responseBody);
        let subLocationDetails = await fetchSubLocationDetails(
          responseBody.booking.location_id,
          responseBody.booking.sub_location_id
        );
        console.log("sublocatio details: ", subLocationDetails);
        if (
          requestBody.current_status === "video_uploaded" &&
          subLocationDetails?.payment_type != "pre_paid"
        ) {
          requestBody.message_type = "video_uploaded";
          customer.customer_name = responseBody.booking.customer_name;
          // await send_message(customer, requestBody, event);
          let message_type = "video_uploaded";
          let booking_details = {
            customer_id: responseBody.booking.customer_id,
            booking_id: responseBody.booking.booking_id,
            customer_name: responseBody.booking.customer_name,
            sub_location_id: responseBody.booking.sub_location_id,
            sub_location_name: responseBody.booking.sub_location_name,
            current_status: responseBody.booking.current_status,
            phone_number: responseBody.booking.phone_number,
            created_at: responseBody.booking.created_at,
          };
          if (responseBody.booking.video_uri_s3) {
            booking_details.video_uri_s3 = responseBody.booking.video_uri_s3;
          } else if (responseBody.booking.video_uri_wasabi) {
            booking_details.video_uri_wasabi =
              responseBody.booking.video_uri_wasabi;
          } else if (responseBody.booking.video_uri) {
            booking_details.video_uri = responseBody.booking.video_uri;
          }
          const sendSmsBody = {
            message_type: message_type,
            booking_details: booking_details,
          };
          await send_message_api(sendSmsBody);
          console.log("Message sent for video uploaded");
          console.log("fcm_registration_token:", customer.registration_token);
          if (customer.registration_token != null) {
            let messageBody = messageTemplate.videoUpladedMessage;
            messageBody.data.customer_id = customer_id;
            messageBody.data.customer_name = customer?.customer_name;
            messageBody.data.customer_email = customer?.customer_email;
            await customerFile.send_push_notification(
              customer.registration_token,
              messageBody
            );
            console.log("Push notifivcation sent for video uploaded");
          }
        }
        if (
          responseBody.booking.current_status === "video_uploaded" &&
          responseBody.booking.transaction_id != null &&
          responseBody.booking.transaction_id !== "null" &&
          responseBody.booking.transaction_id !== ""
        ) {
          requestBody.current_status = "video_shared";
          await update_booking_details(customer_id, booking_id, requestBody);
          console.log(
            "current_status changed to video_shared if current status is video_uploaded + transaction_id != null"
          );
        }

        if (requestBody.current_status === "video_shared") {
          requestBody.short_video_uri = responseBody.booking.short_video_uri;
          requestBody.message_type = "video_shared";
          customer.customer_name = responseBody.booking.customer_name;
          // await send_message(customer, requestBody, event);
          let message_type = "video_shared";
          let booking_details = {
            customer_id: responseBody.booking.customer_id,
            booking_id: responseBody.booking.booking_id,
            customer_name: responseBody.booking.customer_name,
            sub_location_id: responseBody.booking.sub_location_id,
            sub_location_name: responseBody.booking.sub_location_name,
            current_status: responseBody.booking.current_status,
            short_video_uri: responseBody.booking.short_video_uri,
            phone_number: responseBody.booking.phone_number,
          };
          const sendSmsBody = {
            message_type: message_type,
            booking_details: booking_details,
          };
          await send_message_api(sendSmsBody);
          console.log("Video link sent in message");
          console.log("fcm_registration_token:", customer.registration_token);
          if (customer.registration_token != null) {
            let messageBody = messageTemplate.videoSharedMessage;
            messageBody.data.customer_id = customer_id;
            messageBody.data.customer_name = customer?.customer_name;
            messageBody.data.customer_email = customer?.customer_email;
            await customerFile.send_push_notification(
              customer.registration_token,
              messageBody
            );
            console.log("Push notifivcation sent for video uploaded");
          }
          // requestBody.message_type = "gratitude";
          // await send_message(customer, requestBody, event);
          // console.log("Gratitude message sent")
        } else if (requestBody.action == "shot_completed") {
          await delete_shot_from_queue(requestBody, event);
        } else if (requestBody.action == "shot_deleted") {
          await delete_shot_from_queue(requestBody, event);
          if (
            requestBody.location_id == "f347809d-5700-5bec-fc1f-3b179ba42dd2"
          ) {
            await updateTransactionBookingDelete({
              action: "booking_deleted",
              booking_id: requestBody.booking_id,
            });
          }
        } else if (requestBody.action == "booking_updated") {
          console.log("action : booking_updated");
          console.log("updating booking details in queue");
          await update_shot_in_queue(requestBody, event);
          console.log("updated details successfully");
        }

        responseBody.is_success = true;
        break;

      default:
        throw new Error(`Unsupported method: "${requestMethod}"`);
    }
  } catch (err) {
    responseBody.is_success = false;
    responseBody.message = err.message;
    console.log("ERROR : ", err.message);
  }
  console.log("response body : ", responseBody);
  return buildResponse(responseBody);
}

async function booking(event) {
  let responseBody = {};
  let requestMethod = event.httpMethod;
  let customer_id = event.pathParameters.customer_id;
  let booking_id = event.pathParameters.booking_id;
  console.log(event);
  console.log(`customer_id: ${customer_id}, booking_id: ${booking_id}`);
  try {
    switch (requestMethod) {
      case "PATCH":
        try {
          console.log("bookings PATCH method : ");
          let requestBody = JSON.parse(event.body);
          console.log(requestBody);
          await update_booking_details(customer_id, booking_id, requestBody);

          responseBody.is_success = true;
          responseBody.message = "Remark saved successfully";
        } catch (error) {
          responseBody.is_success = false;
          responseBody.message = "Error updating remark";
        }
        break;

      default:
        throw new Error(`Unsupported method: "${requestMethod}"`);
    }
  } catch (err) {
    responseBody.is_success = false;
    responseBody.message = err.message;
    console.log("ERROR : ", err.message);
  }
  console.log("response body : ", responseBody);
  return buildResponse(responseBody);
}

async function generate_video_url(event) {
  let responseBody = {};
  let requestMethod = event.httpMethod;
  let customer_id = event.pathParameters.customer_id;
  let booking_id = event.pathParameters.booking_id;
  console.log("inside booking queries : ");
  console.log(event);
  console.log("request method : " + requestMethod);
  try {
    switch (requestMethod) {
      case "POST":
        let body = JSON.parse(event.body);
        console.log("body extracted is", body);
        if (body != null) {
          let url = body.zip_url_s3;
          if (url != undefined) {
            console.log("URL is", url);
            return await checkAndUpdateVideoUrl(url, event);
          }
        }
        let requestBody = await get_booking_details(customer_id, booking_id);
        if (requestBody.video_uri_wasabi != null) {
          const s3Info = extractS3Info(requestBody.video_uri_wasabi);
          console.log("wasabiInfo", s3Info);
          let newPresignedUrl = await generateWasabiPresignedURL(
            s3Info.s3Bucket,
            s3Info.s3Key,
            604800
          );
          console.log("presignedUrl", newPresignedUrl);
          let newShortLink = await get_short_link(newPresignedUrl);
          const updateObject = {
            short_video_uri: newShortLink,
            video_uri_wasabi: newPresignedUrl,
          };
          let responseOfUpdateBooking = await update_booking_details(
            customer_id,
            booking_id,
            updateObject
          );
          // console.log("response of update booking", responseOfUpdateBooking);
          responseBody.booking = {
            short_video_uri: newShortLink,
            video_uri_wasabi: newPresignedUrl,
          };
        } else if (requestBody.video_uri_s3 != null) {
          console.log("inside video uri s3 update", requestBody.video_uri_s3);
          return await checkAndUpdateVideoUrl(requestBody.video_uri_s3, event);
        }
        break;
      default:
        throw new Error(`Unsupported method: "${requestMethod}"`);
    }
  } catch (err) {
    responseBody.is_success = false;
    responseBody.message = err.message;
    console.log("ERROR : ");
    console.log(err.message);
  }
  console.log("response body : ");
  console.log(responseBody);
  return buildResponse(responseBody);
}

async function lap_details(event) {
  console.log(event.httpMethod);
  console.log("lap_details function called");
  let responseBody = {};
  let requestMethod = event.httpMethod;
  console.log(event);
  console.log("Hello");
  try {
    switch (requestMethod) {
      case "POST":
        responseBody.status = 200;
        responseBody.message = "API Call successful";
        responseBody.is_success = true;
        break;
      default:
        throw new Error(`Unsupported method: "${requestMethod}"`);
    }
  } catch (err) {
    responseBody.is_success = false;
    responseBody.message = err.message;
  }
  return buildResponse(responseBody);
}

async function get_booking_from_id(event) {
  let responseBody = {};
  let requestMethod = event.httpMethod;
  let id = event.pathParameters.id;
  let sub_location_id = event.pathParameters.sub_location_id;
  try {
    switch (requestMethod) {
      case "GET":
        responseBody.booking = await booking_from_id(id, sub_location_id);
        if (responseBody.booking != null)
          responseBody.message = "Booking details fetched successfully";
        else responseBody.message = "No booking found.";
        responseBody.is_success = true;
        break;
      default:
        throw new Error(`Unsupported method: "${requestMethod}"`);
    }
  } catch (err) {
    responseBody.is_success = false;
    responseBody.message = err.message;
  }
  return buildResponse(responseBody);
}

async function get_booking_from_sub_location_id(event) {
  let responseBody = {};
  let requestMethod = event.httpMethod;
  let date = event.pathParameters.date; // date format "YYYY-MM-DD" (UTC)
  let sub_location_id = event.pathParameters.sub_location_id;
  try {
    switch (requestMethod) {
      case "GET":
        responseBody.bookings = await booking_from_sub_location_id(
          date,
          sub_location_id
        );
        if (responseBody.bookings != null)
          responseBody.message = `Bookings of date ${date} fetched successfully`;
        else responseBody.message = "No booking found.";
        responseBody.is_success = true;
        break;
      default:
        throw new Error(`Unsupported method: "${requestMethod}"`);
    }
  } catch (err) {
    responseBody.is_success = false;
    responseBody.message = err.message;
  }
  return buildResponse(responseBody);
}

async function multiple_bookings(event) {
  let responseBody = {};
  let requestBody = JSON.parse(event.body);
  let requestMethod = event.httpMethod;
  try {
    switch (requestMethod) {
      case "POST":
        responseBody.bookings = await get_multiple_bookings_details(
          requestBody
        );
        if (responseBody.bookings != null)
          responseBody.message = "Booking details fetched successfully";
        else responseBody.message = "No booking found.";
        responseBody.is_success = true;
        break;
      default:
        throw new Error(`Unsupported method: "${requestMethod}"`);
    }
  } catch (err) {
    responseBody.is_success = false;
    responseBody.message = err.message;
  }
  return buildResponse(responseBody);
}

const get_multiple_bookings_details = async (requestBody) => {
  let booking_details = [];
  for (var booking_id of requestBody.booking_ids) {
    booking_id = booking_id.replace(/^"(.+(?="$))"$/, "$1"); //For removing quotes from android serialization
    console.log(`Booking Id is "${booking_id}"`);
    let booking_object = await get_booking_from_booking_id(booking_id);
    console.log(`Booking Id response is "${booking_object}"`);
    booking_details.push(booking_object);
  }
  return booking_details;
};

async function get_booking_from_booking_id(booking_id) {
  let params = {
    ExpressionAttributeValues: {
      ":id": booking_id,
    },
    KeyConditionExpression: "booking_id = :id",
    TableName: getBookingTable(),
    IndexName: "booking_id_index",
  };
  let data = await dynamo().query(params);
  return data.Items[0];
}

const booking_from_sub_location_id = async (date, sub_location_id) => {
  let params = {
    ExpressionAttributeValues: {
      ":date": date,
      ":sl": sub_location_id,
    },
    KeyConditionExpression:
      "sub_location_id = :sl AND begins_with(created_at, :date)",
    TableName: getBookingTable(),
    IndexName: "sub_location_id-created_at-index",
  };
  let data = await dynamo().query(params);
  if (data.Items.length > 1) console.log("Multiple bookings found for one id.");
  return data.Items.length ? data.Items : null;
};

const booking_from_id = async (id, sub_location_id) => {
  let params = {
    ExpressionAttributeValues: {
      ":id": id,
      ":sl": sub_location_id,
    },
    KeyConditionExpression: "video_timestamp = :id and sub_location_id = :sl",
    TableName: getBookingTable(),
    IndexName: "video-index",
  };
  let data = await dynamo().query(params);
  let result_data = [];
  console.log("here :: data length. : " + data.Items.length);
  console.log(data);
  for (var i in data.Items) {
    let item = data.Items[i];
    if (item.current_status == "shot_completed") {
      result_data.push(item);
    }
  }
  if (result_data.length > 1)
    console.log("Multiple bookings found for one id.");
  return result_data.length ? data.Items[0] : null;
};

async function send_message(customer, body, event) {
  let requestBody = {};
  requestBody.customer_name = customer.customer_name;
  requestBody.customer_phone_number = customer.phone_number;
  requestBody.message_type = body.message_type;
  requestBody.sub_location_id = body?.booking_details?.sub_location_id;
  requestBody.bookingDetails = body?.booking_details;

  let stageVariables = event.stageVariables;
  console.log("Stage variable : ", stageVariables);
  let lambdaAlias = stageVariables.lambdaAlias;
  console.log("Lambda Alias : ", lambdaAlias);

  if (body.message_type === "video_shared") {
    requestBody.video_uri = body.short_video_uri;
  }
  event.resource = "/send_sms";
  event.body = JSON.stringify(requestBody);
  let payload = JSON.stringify(event);

  const lambdaParams = {
    FunctionName: `sms_function:${lambdaAlias}`,
    InvocationType: "Event",
    LogType: "Tail",
    Payload: payload,
  };

  try {
    console.log("Params of lambda invocation : ", lambdaParams);
    const response = await lambda().invoke(lambdaParams);
    console.log(response);
  } catch (err) {
    console.log("Error in sending message to the customer : ", err);
  }
}

function buildResponse(body) {
  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "OPTIONS,POST,GET,PUT,PATCH,DELETE",
    },
    body: JSON.stringify(body),
  };
}

const get_customer_bookings = async (customer_id) => {
  const dynamo = DynamoDBDocument.from(new DynamoDB({}));
  console.log("customer_id", customer_id);
  let params = {
    ExpressionAttributeValues: {
      ":c": customer_id,
    },
    KeyConditionExpression: "customer_id = :c",
    TableName: getBookingTable(),
  };

  let data = await dynamo.query(params);
  return data.Items;
};

const get_booking_details = async (customer_id, booking_id) => {
  let params = {
    ExpressionAttributeValues: {
      ":c": customer_id,
      ":b": booking_id,
    },
    KeyConditionExpression: "customer_id = :c and booking_id = :b",
    TableName: getBookingTable(),
  };
  let data = await dynamo().query(params);
  return data.Items[0];
};

async function check_customer_presence(customer_id) {
  let params = {
    ExpressionAttributeValues: {
      ":c": customer_id,
    },
    KeyConditionExpression: "customer_id = :c",
    TableName: getCustomerTable(),
  };
  let data = await dynamo().query(params);
  console.log("Data : ", data);
  return data.Items.length == 1 ? data.Items[0] : null;
}

async function fetchSubLocationDetails(location_id, sub_location_id) {
  params = {
    ExpressionAttributeValues: {
      ":l": location_id,
      ":s": sub_location_id,
    },
    KeyConditionExpression: "location_id = :l and sub_location_id = :s",
    TableName: getSublocationsTable(),
  };
  let data = await dynamo().query(params);
  return data.Items[0];
}

const add_booking = async (customer_id, requestBody) => {
  console.log("Inside add booking function");
  var timestamp = new Date()
    .toISOString()
    .replace(/T/, " ")
    .replace(/\..+/, "");
  let params = {
    TableName: getBookingTable(),
    Item: {
      customer_id: customer_id,
      customer_name: requestBody.customer_name,
      phone_number: requestBody.phone_number,
      booking_id: uuidv4(),
      amount: requestBody.amount,
      current_status: requestBody.current_status
        ? requestBody.current_status
        : "PENDING",
      video_timestamp: "0",
      video_uri: requestBody.video_uri,
      thumbnail_uri: requestBody.thumbnail_uri,
      camera_count: {},
      shot_id: requestBody.shot_id,
      shot_name: requestBody.shot_name,
      shot_mode: requestBody.shot_mode,
      operator_id: requestBody.operator_id,
      location_id: requestBody.location_id,
      location_name: requestBody.location_name,
      sub_location_id: requestBody.sub_location_id,
      sub_location_name: requestBody.sub_location_name,
      transaction_id: requestBody.transaction_id,
      created_at: timestamp,
      updated_at: timestamp,
      discount: "0%",
      is_downloaded: requestBody.is_downloaded ? requestBody.is_downloaded : 0,
      video_orientation: requestBody?.video_orientation,
      cba_user_id: requestBody?.cba_user_id,
    },
  };
  console.log(params.Item);
  await dynamo().put(params);
  return params.Item;
};

async function update_booking_details(customer_id, booking_id, requestBody) {
  console.log(
    "Updating bookings with booking id ",
    booking_id,
    " customer_id ",
    customer_id
  );
  console.log("RequestBody : ", requestBody);
  let timestamp = new Date()
    .toISOString()
    .replace(/T/, " ")
    .replace(/\..+/, "");
  let update_key_set = new Set([
    "customer_name",
    "shot_id",
    "shot_name",
    "shot_mode",
    "video_uri",
    "thumbnail_uri",
    "current_status",
    "transaction_id",
    "video_timestamp",
    "short_video_uri",
    "video_uri_s3",
    "video_uri_wasabi",
    "start_time",
    "stop_time",
    "discount",
    "hls_uri",
    "billing_number",
    "is_downloaded",
    "speed_data",
    "refund_mode",
    "group_video_url",
    "editing_trigger_count",
    "editing_success_count",
    "zip_url_s3",
    "zip_url_s3Image",
    "amount",
    "video_orientation",
    "retargeting_remark",
    "refund_reason",
  ]);
  var expression_attribute_values = {};
  var expressionAttributeNames = {};
  var update_expression = "set ";
  var count = 0;
  for (var key in requestBody) {
    if (update_key_set.has(key)) {
      count++;
      if (key == "editing_trigger_count" || key == "editing_success_count")
        continue;
      var __key = ":" + key;
      update_expression += key + " = " + __key + ", ";
      expression_attribute_values[__key] = requestBody[key];
    }
  }
  if (count == 0) return;
  if (requestBody.editing_trigger_count != null) {
    expressionAttributeNames = {
      "#attr": "editing_trigger_count",
    };
    expression_attribute_values[":deltaValue"] =
      requestBody.editing_trigger_count;
    expression_attribute_values[":zero"] = 0;
    update_expression += `#attr = if_not_exists(#attr, :zero) + :deltaValue,`;
  }

  if (requestBody.editing_success_count != null) {
    expressionAttributeNames = {
      "#attr": "editing_success_count",
    };
    expression_attribute_values[":deltaValue"] =
      requestBody.editing_success_count;
    expression_attribute_values[":zero"] = 0;
    update_expression += `#attr = if_not_exists(#attr, :zero) + :deltaValue,`;
  }
  update_expression += "updated_at = :updated_at";
  expression_attribute_values[":updated_at"] = timestamp;
  let params = {
    TableName: getBookingTable(),
    Key: {
      customer_id: customer_id,
      booking_id: booking_id,
    },
    UpdateExpression: update_expression,
    ExpressionAttributeValues: expression_attribute_values,
  };
  console.log("params", params);
  if (
    requestBody.editing_trigger_count != null ||
    requestBody.editing_success_count != null
  ) {
    params["ExpressionAttributeNames"] = expressionAttributeNames;
  }
  const response = await dynamo().update(params);
  console.log("repsone of booking update", response);
  return response.Items;
}

async function add_shot_to_queue(customer, booking_details, booking, event) {
  console.log("Inside add shot to queue function");
  console.log("event", event);
  event.pathParameters = {};
  event.resource =
    "/locations/{location_id}/sub_location/{sub_location_id}/shots_queue";
  event.httpMethod = "POST";
  event.pathParameters.location_id = booking_details.location_id;
  event.pathParameters.sub_location_id = booking_details.sub_location_id;
  let stageVariables = event.stageVariables;
  console.log("Stage variable : ", stageVariables);
  let lambdaAlias = stageVariables.lambdaAlias;
  console.log("Lambda Alias : ", lambdaAlias);
  let requestBody = JSON.parse(event?.body);

  let body = {
    customer_id: customer.customer_id,
    customer_name: booking.customer_name,
    customer_phone_number: customer.phone_number,
    booking_id: booking_details.booking_id,
    shot_id: booking_details.shot_id,
    shot_name: booking_details.shot_name,
    path_ids: booking.path_ids,
    shot_mode: booking_details.shot_mode,
    operator_id: booking_details.operator_id,
    video_orientation: booking_details?.video_orientation,
    identifier: requestBody.groupDetails?.identifier,
    video_count: requestBody?.video_count,
    qr_link: booking?.qr_link,
    billing_number: booking?.billing_number,
    no_of_customers: requestBody?.transaction_details?.no_of_customers,
    cba_user_type: booking?.cba_user_type,
    cba_user_id: booking?.cba_user_id,
  };
  console.log(body);
  event.body = JSON.stringify(body);
  event = JSON.stringify(event);
  const lambdaParams = {
    FunctionName: `locations_function:${lambdaAlias}`,
    InvocationType: "Event",
    LogType: "Tail",
    Payload: event,
  };
  const response = await lambda().invoke(lambdaParams);
  console.log(response);
}

async function delete_shot_from_queue(shot_details, event) {
  let body = {
    booking_id: shot_details.booking_id,
  };
  console.log(shot_details.location_id);
  console.log(shot_details.sub_location_id);

  let stageVariables = event.stageVariables;
  console.log("Stage variable : ", stageVariables);
  let lambdaAlias = stageVariables.lambdaAlias;
  console.log("Lambda Alias : ", lambdaAlias);

  let pathParameters = {
    location_id: shot_details.location_id,
    sub_location_id: shot_details.sub_location_id,
  };
  event.resource =
    "/locations/{location_id}/sub_location/{sub_location_id}/shots_queue";
  event.httpMethod = "DELETE";

  event.pathParameters = pathParameters;
  event.body = JSON.stringify(body);
  let payload = JSON.stringify(event);
  console.log("booking.js payload to shot_queue :: " + payload);
  const lambdaParams = {
    FunctionName: `locations_function:${lambdaAlias}`,
    InvocationType: "Event",
    LogType: "Tail",
    Payload: payload,
  };
  const response = await lambda().invoke(lambdaParams); 
  console.log(response);
}

async function update_shot_in_queue(shot_details, event) {
  console.log("Inside the update shot in queue");
  let body = shot_details;
  console.log(shot_details.location_id);
  console.log(shot_details.sub_location_id);
  console.log(shot_details.booking_id);

  let pathParameters = {
    location_id: shot_details.location_id,
    sub_location_id: shot_details.sub_location_id,
  };

  let stageVariables = event.stageVariables;
  console.log("Stage variable : ", stageVariables);
  let lambdaAlias = stageVariables.lambdaAlias;
  console.log("Lambda Alias : ", lambdaAlias);
  event.resource =
    "/locations/{location_id}/sub_location/{sub_location_id}/shots_queue";
  event.httpMethod = "PATCH";
  event.pathParameters = pathParameters;
  event.body = JSON.stringify(body);
  let payload = JSON.stringify(event);
  console.log("booking.js payload to shot_queue :: " + payload);
  const lambdaParams = {
    FunctionName: `locations_function:${lambdaAlias}`,
    InvocationType: "Event",
    LogType: "Tail",
    Payload: payload,
  };
  const response = await lambda().invoke(lambdaParams);
  console.log("updated shot queue : " + response);
}

async function get_bookings_from_location_id(event) {
  console.log("inside the get bookings from location id function");
  let location_id = event.pathParameters.location_id;
  let start_date = event.queryStringParameters.start_date;
  let end_date = event.queryStringParameters.end_date;
  let requestMethod = event.httpMethod;
  let responseBody = {};

  try {
    switch (requestMethod) {
      case "GET":
        console.log("inside the get method");
        let bookingsData = await get_booking_from_location_date_range(
          location_id,
          start_date,
          end_date
        );
        responseBody.bookings = bookingsData;
        responseBody.message =
          "Bookings fetched successfully for the location and the date range.";
        responseBody.is_success = true;
        break;
      default:
        throw new Error(`Unsupported method: "${requestMethod}"`);
    }
  } catch (err) {
    responseBody.is_success = false;
    responseBody.message = err.message;
  }
  return buildResponse(responseBody);
}

async function get_booking_from_location_date_range(
  locationId,
  startDate,
  endDate
) {
  startDate = `${startDate} 00:00:00`;
  endDate = `${endDate} 23:59:59`;

  console.log(`Location id: ${locationId}`);
  console.log(`Start date: ${startDate}`);
  console.log(`End date: ${endDate}`);

  try {
    let params = {
      TableName: getBookingTable(),
      IndexName: "location_id-created_at-index",
      KeyConditionExpression:
        "location_id = :locationId AND created_at BETWEEN :startDate AND :endDate",
      ExpressionAttributeValues: {
        ":locationId": locationId,
        ":startDate": startDate,
        ":endDate": endDate,
      },
      ProjectionExpression:
        "customer_id, booking_id, amount, customer_name, created_at, current_status, discount, video_uri_s3, phone_number, short_video_uri, transaction_id, sub_location_id, retargeting, refund_reason",
    };
    console.log(`params: `, params);

    const bookings = [];
    let data;
    do {
      data = await dynamo().query(params);
      bookings.push(...data.Items);
      console.log("data", data);
      params.ExclusiveStartKey = data.LastEvaluatedKey;
    } while (data.LastEvaluatedKey);

    return bookings;
  } catch (error) {
    console.log(error);
    return [];
  }
}

async function get_bookings(event) {
  console.log(event);
  let location_id = event.queryStringParameters.location_id;
  let created_at = event.queryStringParameters.created_at;
  let is_transaction_completed = event.queryStringParameters.transaction_status;
  if (!is_transaction_completed) {
    is_transaction_completed = 0;
  } else is_transaction_completed = 1;
  let responseBody = {};
  let requestMethod = event.httpMethod;
  try {
    switch (requestMethod) {
      case "GET":
        responseBody.booking = await get_booking_from_location_date_index(
          location_id,
          created_at,
          is_transaction_completed
        );
        if (responseBody.booking != null) {
          responseBody.message = "Booking details fetched successfully";
        } else responseBody.message = "No booking found.";
        responseBody.is_success = true;
        break;
      default:
        throw new Error(`Unsupported method: "${requestMethod}"`);
    }
  } catch (err) {
    responseBody.is_success = false;
    responseBody.message = err.message;
  }
  return buildResponse(responseBody);
}

const get_booking_from_location_date_index = async (
  location_id,
  created_at,
  is_transaction_completed
) => {
  let params = {
    ExpressionAttributeValues: {
      ":lid": location_id,
      ":ca": created_at,
    },
    KeyConditionExpression:
      "location_id = :lid and begins_with(created_at , :ca)",
    TableName: getBookingTable(),
    IndexName: "location_id-created_at-index",
  };
  console.log("params", params);
  let data = await dynamo().query(params);
  let filterdata = [];
  if (is_transaction_completed) {
    filterdata = data.Items.filter((item) => {
      return (
        item.transaction_id == null ||
        item.transaction_id == "" ||
        item.transaction_id == "null" ||
        item.transaction_id == {} ||
        (item.refund_mode != undefined &&
          item.refund_mode != null &&
          item.refund_mode != "")
      );
    });
    data.Items = filterdata;
  }
  return data.Items.length ? data.Items : null;
};

async function checkAndUpdateVideoUrl(video_url, event) {
  if (video_url != null) {
    try {
      var responseOfCheckUrl = await checkURL(video_url);
    } catch (err) {
      console.log("Error is : ", err);
    }
  }
  if (!responseOfCheckUrl) {
    console.log("Update the booking ", video_url.toString());
    return await updateBookingWithNewUrl(event, video_url, true);
  } else {
    console.log(
      "No action needed to be performed for booking : ",
      video_url.toString()
    );
    return await updateBookingWithNewUrl(event, video_url, false);
  }
}

async function checkURL(urlToCheck) {
  return new Promise((resolve, reject) => {
    https
      .get(urlToCheck, (response) => {
        // Check the response status code to determine if the URL is working or giving an error
        if (response.statusCode >= 200 && response.statusCode < 400) {
          console.log("URL is working."); // Status code in the 2xx or 3xx range indicates success
          resolve(true);
        } else {
          console.log("URL is not working. Status code:", response.statusCode); // Status code in the 4xx or 5xx range indicates an error
          resolve(false);
        }
      })
      .on("error", (error) => {
        console.error("Error occurred while checking the URL:", error.message);
        reject(error);
      });
  });
}

async function updateBookingWithNewUrl(event, video_url, generateUrlFlag) {
  let requestBody = {};
  if (generateUrlFlag) {
    requestBody.s3Bucket = await extractS3Bucket(video_url);
    requestBody.s3Key = await extractS3Key(video_url);
    console.log("s3Bucket = ", requestBody.s3Bucket);
    console.log("s3Key = ", requestBody.s3Key);
    requestBody.action = "video_uploaded";
  }
  event.httpMethod = "PATCH";
  event.body = JSON.stringify(requestBody);
  return await booking_queries(event);
}

async function extractS3Bucket(video_url) {
  let start = video_url.indexOf("/");
  let end = video_url.indexOf(".");
  let s3Bucket = video_url.substring(start + 2, end);
  return s3Bucket;
}

async function extractS3Key(video_url) {
  let start = (await nthOccurence(video_url, "/", 3)) + 1;
  let end = await nthOccurence(video_url, "?", 1);
  let s3Key = video_url.substring(start, end);
  console.log("Key : Start = ", start, " End = ", end);
  s3Key = decodeURIComponent(s3Key);
  console.log("s3Key formed = ", s3Key);
  return s3Key;
}

async function nthOccurence(video_url, character, occurence) {
  let current_occurence = 0;
  let size = video_url.length;
  console.log("Size = ", size);
  for (let index = 0; index < size; index++) {
    if (video_url[index] == character) current_occurence++;
    if (current_occurence == occurence) return index;
  }
}

function endsWithZip(str) {
  return str.endsWith(".zip");
}

async function get_short_link(video_link) {
  try {
    const resp = await axios.post(
      `https://firebasedynamiclinks.googleapis.com/v1/shortLinks?key=AIzaSyCbknXNWtiexID0ZJlSNWJMSoBPj5jFK_I`,
      {
        dynamicLinkInfo: {
          domainUriPrefix: "https://droame.page.link",
          link: video_link,
          androidInfo: {
            androidFallbackLink: video_link,
          },
          iosInfo: {
            iosFallbackLink: video_link,
          },
        },
        suffix: {
          option: "SHORT",
        },
      }
    );
    console.log(resp.data.shortLink);
    console.log("Link Shortened successfully");
    return resp.data.shortLink;
  } catch (err) {
    console.log("Error in short link api is : ", err);
    return "";
  }
}

async function get_short_link_amer(video_link) {
  try {
    const resp = await axios.post(
      `https://firebasedynamiclinks.googleapis.com/v1/shortLinks?key=AIzaSyCbknXNWtiexID0ZJlSNWJMSoBPj5jFK_I`,
      {
        dynamicLinkInfo: {
          domainUriPrefix: "https://droame.page.link",
          link: video_link,
        },
        suffix: {
          option: "SHORT",
        },
      }
    );
    console.log(resp.data.shortLink);
    console.log("Link Shortened successfully");
    return resp.data.shortLink;
  } catch (err) {
    console.log("Error in short link api is : ", err);
    return "";
  }
}

async function get_booking_details_by_bookingId(booking_id) {
  let params = {
    ExpressionAttributeValues: {
      ":b": booking_id,
    },
    KeyConditionExpression: "booking_id = :b",
    TableName: getBookingTable(),
    IndexName: "booking_id_index",
  };
  try {
    let data = await dynamo().query(params);
    console.log("booking data by booking id:", data.Items);
    // You can process the retrieved data here and return a response
    return data.Items;
  } catch (err) {
    console.log("error in fetching data by booking id", err);
    throw new Error(err);
  }
}

function extractS3Info(url) {
  const s3Info = {};

  const start = url.indexOf("://") + 3;
  const end = url.indexOf(".s3.");
  s3Info.s3Bucket = url.slice(start, end);

  const start2 = url.indexOf(".com/") + 5;
  const end2 = url.indexOf("?");
  const key = url.slice(start2, end2);
  s3Info.s3Key = decodeURIComponent(key);
  return s3Info;
}

async function generateWasabiPresignedURL(
  bucketName,
  fileKey,
  expirationSeconds
) {
  try {
    const s3 = new S3({
      endpoint: "https://s3.ap-southeast-1.wasabisys.com",
      region: "ap-southeast-1",
      credentials: {
        accessKeyId: "W4E4MKBU6L98AOA3BA6A",
        secretAccessKey: "tzeuX99MNjda36kBl8C7HUhgh7eSj5XtbbGBvnA0",
      },
    });
    const params = {
      Bucket: bucketName,
      Key: fileKey,
      Expires: expirationSeconds,
    };

    const url = await getSignedUrl(s3, new GetObjectCommand(params), {
      expiresIn: expirationSeconds,
    });
    // Parse the URL
    const urlObject = new URL(url);

    // Remove the X-Amzn-Trace-Id parameter from the query string
    const searchParams = new URLSearchParams(urlObject.search);
    searchParams.delete("X-Amzn-Trace-Id");

    // Rebuild the URL with the modified query string
    const newUrl = `${urlObject.protocol}//${urlObject.host}${
      urlObject.pathname
    }?${searchParams.toString()}`;
    console.log("url", url);
    return newUrl;
  } catch (err) {
    console.log(err);
    throw err;
  }
}

async function updateTicketDetails(ticket_id, requestBody) {
  try {
    console.log("RequestBody : ", requestBody);
    let timestamp = new Date()
      .toISOString()
      .replace(/T/, " ")
      .replace(/\..+/, "");
    let update_key_set = new Set([
      "customer_name",
      "phone_number",
      "booking_id",
      "customer_id",
      "sub_location_id",
      "active",
    ]);
    let expression_attribute_values = {};
    let expressionAttributeNames = {};
    let update_expression = "set ";
    for (let key in requestBody) {
      if (update_key_set.has(key)) {
        let __key = ":" + key;
        update_expression += key + " = " + __key + ", ";
        expression_attribute_values[__key] = requestBody[key];
      }
    }

    update_expression += "updated_at = :updated_at";
    expression_attribute_values[":updated_at"] = timestamp;
    let params = {
      TableName: getTicketTable(),
      Key: {
        ticket_id: ticket_id,
      },
      UpdateExpression: update_expression,
      ExpressionAttributeValues: expression_attribute_values,
      ReturnValues: "UPDATED_NEW",
    };
    console.log("params", params);
    if (
      requestBody.editing_trigger_count != null ||
      requestBody.editing_success_count != null
    ) {
      params["ExpressionAttributeNames"] = expressionAttributeNames;
    }
    const response = await dynamo().update(params);
    console.log("update ticket response", response);
    return true;
  } catch (error) {
    console.log("error in updating ticket details", error.stack);
    return false;
  }
}

module.exports.booking_queries = booking_queries;
module.exports.get_customer_bookings = get_customer_bookings;
module.exports.get_bookings = get_bookings;
module.exports.add_booking = add_booking;
module.exports.queries = queries;
module.exports.get_booking_from_id = get_booking_from_id;
module.exports.get_booking_from_sub_location_id =
  get_booking_from_sub_location_id;
module.exports.multiple_bookings = multiple_bookings;
module.exports.lap_details = lap_details;
module.exports.get_booking_details = get_booking_details;
module.exports.get_booking_from_booking_id = get_booking_from_booking_id;
module.exports.update_booking_details = update_booking_details;
module.exports.delete_shot_from_queue = delete_shot_from_queue;
module.exports.generate_video_url = generate_video_url;
module.exports.get_booking_from_location_date_index =
  get_booking_from_location_date_index;
module.exports.get_booking_details_by_bookingId =
  get_booking_details_by_bookingId;
module.exports.booking_from_sub_location_id = booking_from_sub_location_id;
module.exports.get_multiple_bookings_details = get_multiple_bookings_details;
module.exports.get_booking_from_booking_id = get_booking_from_booking_id;
module.exports.update_shot_in_queue = update_shot_in_queue;
module.exports.get_bookings_from_location_id = get_bookings_from_location_id;
module.exports.fetchSubLocationDetails = fetchSubLocationDetails;
module.exports.add_shot_to_queue = add_shot_to_queue;
module.exports.booking = booking;
