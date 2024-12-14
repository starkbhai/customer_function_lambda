


exports.handler = async (event, context) => {
    let response;
    console.log("EVENT ->->->::::::::::::->->: new event check for this ", event);
    console.log("Resource : ", event.resource);
    try {
      initConstants(event, context);
    } catch (error) {
      console.log("Error in initializing constants : ", err);
    }
    try {
      switch (event.resource) {
        case "/customer_details":
          response = await auth.signup(event);
          break;
        case "/bookings":
          response = await booking.get_bookings(event);
          break;
        case "/location/{location_id}/bookings":
          response = await booking.get_bookings_from_location_id(event);
          break;
        case "/customer_exists":
          response = await auth.signin(event);
          break;
        case "/booking_from_id/{sub_location_id}/date/{date}":
          response = await booking.get_booking_from_sub_location_id(event);
          break;
        case "/booking_from_id/{sub_location_id}/{id}":
          response = await booking.get_booking_from_id(event);
          break;
        case "/customer_details/{customer_id}":
          console.log("--1--");
          response = await customer.customer_queries(event);
          break;
        case "/customer_details/{customer_id}/videos":
          console.log("--2--");
          response = await customer.video_queries(event);
          break;

          
        case "/customer_details/{customer_id}/bookings":
          console.log("--3--");
          response = await booking.queries(event);
          break;
       
        default:
          throw new Error(`Unsupported method`);
      }
    } catch (err) {
      console.log("inside catch : ", err);
      response = buildResponse(err.message);
    }
    console.log("response to send : ", response);
    return response;
  };
  
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