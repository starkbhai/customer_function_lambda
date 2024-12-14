const { default: axios } = require("axios");
const { getAlias } = require("./constants");
const paymentServiceURL =
  "https://oeibf65v72.execute-api.us-east-1.amazonaws.com";

function apiStage() {
  const lambdaAlias = getAlias();
  const API_TEST_STAGE = "test";
  const API_PROD_STAGE = "dev";
  let apiStage = API_PROD_STAGE;
  if (lambdaAlias === "dev") {
    apiStage = API_TEST_STAGE;
  }
  return apiStage;
}

const getPaymentServiceUrl = () => {
  return `${paymentServiceURL}/${apiStage()}`;
};
console.log("apistage", apiStage);
const a = getPaymentServiceUrl();

async function send_message_api(body) {
  try {
    const response = await axios.patch(
      "https://4nak54sorhkuqt325oq2eiahme0kxmca.lambda-url.us-east-1.on.aws/sms/send_sms",
      body
    );
    console.log("message sent response", response);
  } catch (error) {
    console.log("error in send_message_api", error.stack);
  }
}

async function createTransaction(data) {
  try {
    console.log("transaction data", data);
    console.log(`${getPaymentServiceUrl()}/payment`);
    const response = await axios.post(
      `${getPaymentServiceUrl()}/payment`,
      data
    );
    return response;
  } catch (error) {
    console.log("error in createTransaction", error.stack);
  }
}

async function updateTransactionBookingDelete(data) {
  try {
    console.log("transaction data", data);
    console.log(`${getPaymentServiceUrl()}/payment`);
    const response = await axios.patch(
      `${getPaymentServiceUrl()}/payment/amer`,
      data
    );
    return response;
  } catch (error) {
    console.log("error in createTransaction", error.stack);
  }
}

module.exports = {
  send_message_api,
  createTransaction,
  updateTransactionBookingDelete,
};
