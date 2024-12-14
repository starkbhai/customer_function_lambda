const { DynamoDBDocument } = require("@aws-sdk/lib-dynamodb");
const { DynamoDB } = require("@aws-sdk/client-dynamodb");
const dynamo = () => DynamoDBDocument.from(new DynamoDB());
const { getBookingTable, getCustomerTable } = require("./constants");
const axios = require('axios');
const booking = require("./booking.js");

async function customer_queries(event) {
    let responseBody = {};
    let requestMethod = event.httpMethod;
    let customer_id = event.pathParameters.customer_id;
    try {
        switch (requestMethod) {
            case 'GET':
                responseBody.customer = await get_customer_details(customer_id);
                responseBody.customer_id = customer_id;
                console.log("customer Id:", responseBody.customer_id);
                responseBody.message = "Customer details fetched successfully";
                responseBody.is_success = true;
                break;

            case 'PATCH':
                let requestBody = JSON.parse(event.body);
                await update_customer_details(customer_id, requestBody);
                responseBody.message = "Customer details updated successfully";
                responseBody.is_success = true;
                break;

            case 'DELETE':
                await delete_customer_details_with_bookings(customer_id);
                responseBody.message = "Customer details deleted successfully";
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

async function video_queries(event) {
    let responseBody = {};
    let requestMethod = event.httpMethod;
    let customer_id = event.pathParameters.customer_id;
    try {
        switch (requestMethod) {
            case 'GET':
                responseBody.videos = await get_videos(customer_id);
                responseBody.customer_id = customer_id;
                responseBody.message = "Videos of given customer fetched successfully";
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

async function process_push_notification(event) {
    let requestBody = JSON.parse(event.body);
    let requestMethod = event.httpMethod;
    var responseBody = {};
    try {
        var failed_notification_customer_ids = [];
        switch (requestMethod) {
            case 'POST':
                failed_notification_customer_ids = await push_notification_customers(requestBody, event);
                console.log("Failed notification customer ids : ", failed_notification_customer_ids.toString());
                if (failed_notification_customer_ids.length === 0) {
                    responseBody.message = "Notifications sent successfully to all the customers";
                    responseBody.failed_notification_customer_ids = [];
                    responseBody.is_success = true;
                }
                else {
                    responseBody.is_success = false;
                    responseBody.message = "Notifications failed";
                    responseBody.failed_notification_customer_ids = failed_notification_customer_ids;
                }
                break;
            default:
                console.log(`Unsupported method: "${requestMethod}"`);
                throw new Error(`Unsupported method: "${requestMethod}"`);
        }
    } catch (error) {
        console.log('Error in process_push_notification function in customers.js :' + error);
        responseBody.is_success = false;
        responseBody.message = error.message;
    }
    return buildResponse(responseBody);
}

async function random_customers_queries(event) {
    let responseBody = {};
    let requestMethod = event.httpMethod;
    let requestBody = JSON.parse(event.body);
    let location_id = requestBody.location_id;
    let count = requestBody.count;
    let messageBody = requestBody.message;
    let customerIds = [];
    try {
        switch (requestMethod) {
            case 'POST':
                const bookings = await get_recent_bookings_for_location(location_id);
                bookings.forEach(booking => {
                    customerIds.push(booking.customer_id);
                });
                console.log("customer_ids", customerIds);
                if (customerIds.length > count) {
                    responseBody.customer_ids = await select_random_customers(customerIds, count);
                }
                else responseBody.customer_ids = customerIds;
                responseBody.message = messageBody;
                console.log("responseBody", responseBody);
                const response = await push_notification_customers(responseBody, event);
                responseBody.message = "Push notification send successfully";
                responseBody.is_success = true;
                break;
            default:
                console.log(`Unsupported method: "${requestMethod}"`);
                throw new Error(`Unsupported method: "${requestMethod}"`);
        }
    } catch (err) {
        console.log(err);
        responseBody.is_success = false;
        responseBody.message = "";
    }
    return buildResponse(responseBody);
}


function buildResponse(body) {
    return {
        statusCode: 200,
        headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "OPTIONS,POST,GET,PUT,PATCH,DELETE"
        },
        body: JSON.stringify(body)
    };
}

async function get_recent_bookings_for_location(location_id) {
    const currentTime = new Date();
    const fifteenMinutesAgo = new Date(currentTime - 15 * 60 * 1000).toISOString().replace(/T/, ' ').replace(/\..+/, '');
    console.log("fifteenMinutesAgo", fifteenMinutesAgo);
    const sixtyMinutesAgo = new Date(currentTime - 60 * 60 * 1000).toISOString().replace(/T/, ' ').replace(/\..+/, '');
    console.log("sixtyMinutesAgo", sixtyMinutesAgo);
    const params = {
        TableName: getBookingTable(),
        IndexName: "location_id-created_at-index",
        KeyConditionExpression: 'location_id = :locationId AND created_at BETWEEN :startTime AND :endTime',
        ExpressionAttributeValues: {
            ':locationId': location_id,
            ':startTime': sixtyMinutesAgo,
            ':endTime': fifteenMinutesAgo
        },
    };
    console.log("params", params);
    let data = await dynamo().query(params);
    console.log("response", data.Items);
    return data.Items;
}

async function select_random_customers(customer_ids, count) {
    var data;
    try {
        for (let i = customer_ids.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [customer_ids[i], customer_ids[j]] = [customer_ids[j], customer_ids[i]];
        }
        data = customer_ids.slice(0, count);
    } catch (err) {
        console.log(err);
    }
    return data;
}

async function get_videos(customer_id) {
    let params = {
        ExpressionAttributeValues: {
            ':c': customer_id
        },
        KeyConditionExpression: 'customer_id = :c',
        TableName: getCustomerTable()
    };
    let data = await dynamo().query(params);
    return data.Items;
}

const delete_customer_details_with_bookings = async (customer_id) => {
    console.log('inside delete_customer_details_with_bookings function');
    try {
        // Step 1: Delete all bookings of the customer
        const bookingsParams = {
            TableName: getBookingTable(),
            KeyConditionExpression: 'customer_id = :id',
            ExpressionAttributeValues: {
                ':id': customer_id,
            },
        };
        const bookingsData = await dynamo().query(bookingsParams);
        console.log('Fetched bookings data: ', bookingsData);
        const deleteBookingPromises = bookingsData.Items.map((booking) => {
            const deleteParams = {
                TableName: getBookingTable(),
                Key: {
                    customer_id: customer_id,
                    booking_id: booking.booking_id,
                },
            };
            return dynamo().delete(deleteParams);
        });

        await Promise.all(deleteBookingPromises);
        console.log(`Deleted ${deleteBookingPromises.length} bookings for customer with customer_id ${customer_id}`);

        // Step 2: Delete the customer entry in the customers_table
        const customerDeleteParams = {
            TableName: getCustomerTable(),
            Key: {
                customer_id: customer_id,
            },
        };

        await dynamo().delete(customerDeleteParams);
        console.log(`Deleted customer entry for customer_id ${customer_id}`);
    } catch (err) {
        console.error('Error occurred while deleting customer and its bookings:', err);
    }
}

async function get_customer_details(customer_id) {
    console.log('Inside the get customer details');
    let params = {
        ExpressionAttributeValues: {
            ':c': customer_id
        },
        KeyConditionExpression: 'customer_id = :c',
        ProjectionExpression: "customer_id, customer_name, customer_email, phone_number, phone_number_verified, email_verified, survey_form_response, registration_token",
        TableName: getCustomerTable()
    };
    console.log("params", params);
    let data = await dynamo().query(params);
    console.log("data", data);
    return data.Items[0];
}

const update_customer_details = async (customer_id, requestBody) => {
    var timestamp = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');

    var update_key_set = new Set([
        'customer_name',
        'phone_number',
        'customer_email',
        'email_verified',
        'firebase_uid',
        'phone_number_verified',
        'registration_token',
        'survey_form_response',
        'updated_at'
    ]);
    var expression_attribute_values = {};
    var update_expression = "set ";
    var count = 0;
    for (var key in requestBody) {
        console.log(key);
        if (update_key_set.has(key)) {
            count++;
            var __key = ":" + key;
            update_expression += key + " = " + __key + ", ";
            expression_attribute_values[__key] = requestBody[key];
        }
    }

    if (count == 0) return;
    update_expression += 'updated_at = :updated_at';
    expression_attribute_values[':updated_at'] = timestamp;
    let params = {
        TableName: getCustomerTable(),
        Key: {
            'customer_id': customer_id
        },
        UpdateExpression: update_expression,
        ExpressionAttributeValues: expression_attribute_values,
    };
    console.log(params);
    const response = await dynamo().update(params);
    return response.Item;
}

async function push_notification_customers(requestBody, event) {
    let failed_notification_customer_ids = [];
    try {
        var sendPushNotifications = requestBody.customer_ids.map(async (customer_id) => {
            let customer_details = await get_customer_details(customer_id);
            console.log("Fetched customer details are : ", JSON.stringify(customer_details));
            let booking_details = await booking.get_customer_bookings(customer_id);
            booking_details.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            const mostRecentBooking = booking_details[0];
            let fcm_registration_token = customer_details?.registration_token;
            //modyfying the message body if the type is booking
            if (requestBody.message.data?.type === 'booking' || requestBody.message.data?.type === 'user-profile') {
                requestBody.message.data.customer_id = customer_id;
                requestBody.message.data.customer_name = customer_details?.customer_name;
                requestBody.message.data.customer_email = customer_details?.customer_email;
            }
            let messageBody = requestBody.message;
            console.log(fcm_registration_token);
            console.log("Notification body : ", messageBody);
            const bookingBody = {
                current_status: "Approved",
            }
            const shotQueueBody = {
                location_id: mostRecentBooking.location_id,
                sub_location_id: mostRecentBooking.sub_location_id,
                current_status: "waiting",
                booking_id: mostRecentBooking.booking_id,
                action: "booking_updated"
            }
            let response = await send_push_notification(fcm_registration_token, messageBody);
            await booking.update_booking_details(customer_id, mostRecentBooking.booking_id, bookingBody);
            await booking.update_shot_in_queue(shotQueueBody, event);
            if (!response) failed_notification_customer_ids.push(customer_id);
        });
        await Promise.allSettled(sendPushNotifications);
        console.log("Customer id of failed notifications is : " + failed_notification_customer_ids);
    } catch (err) {
        console.log(err);
    }
    return failed_notification_customer_ids;
}

async function send_push_notification(fcm_registration_token, messageBody) {
    const serverKey = "AAAAJ1cFdls:APA91bEo2kO8X4g3QTgYKObwqXw5nihXDF_ldm6fKeKXL6ZCxeQ76inTsAYhHms33aSKmstPrPWOPmBgcLJnZsCojejcShzyx9v6pvKlNl4DECpeKwSzGNaXtXnT1zra3CtA0Y5z9s8F";
    const fcmUrl = 'https://fcm.googleapis.com/fcm/send';
    const data = {
        to: fcm_registration_token, // Replace with the device token of the recipient
        notification: {
            title: messageBody.notification.title,
            body: messageBody.notification.body,
            image: messageBody.notification.image
        },
        data: messageBody.data // messgageBody is in the JSON format
    };

    console.log('data', data);
    const headers = {
        'Content-Type': 'application/json',
        Authorization: `key=${serverKey}`,
    };
    try {
        const response = await axios.post(fcmUrl, data, { headers });
        console.log('FCM response:', response.data);
        return true;
    }
    catch (error) {
        console.log('Error sending push notification:', error);
        return false;
    }
}

module.exports.video_queries = video_queries;
module.exports.customer_queries = customer_queries;
module.exports.process_push_notification = process_push_notification;
module.exports.random_customers_queries = random_customers_queries;
module.exports.get_videos = get_videos;
module.exports.get_customer_details = get_customer_details;
module.exports.update_customer_details = update_customer_details;
module.exports.send_push_notification = send_push_notification;