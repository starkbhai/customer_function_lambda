const process = require("process");
const { LAMBDA_ALIAS_PROD, LAMBDA_ALIAS_DEV } = process.env;
const BOOKINGS_TABLE = "bookings";
const CUSTOMERS_TABLE = "customers";
const SUB_LOCATIONS_TABLE = "sub_locations";
const TICKET_TABLE = "ticket_table";
const GROUPS_TABLE = "groups";
const COUNTER_TABLE = "Counter_Table";
const PROD_TABLE_SUFFIX = "";
const DEV_TABLE_SUFFIX = "_dev";

let BOOKINGS_TABLE_NAME = BOOKINGS_TABLE;
let CUSTOMERS_TABLE_NAME = CUSTOMERS_TABLE;
let LAMBDA_ALIAS = LAMBDA_ALIAS_PROD;
let SUB_LOCATIONS_TABLE_NAME = SUB_LOCATIONS_TABLE;
let GROUPS_TABLE_NAME = GROUPS_TABLE;
let TICKET_TABLE_NAME = TICKET_TABLE;
let COUNTER_TABLE_NAME = COUNTER_TABLE;

function configureTableName() {
  if (LAMBDA_ALIAS == LAMBDA_ALIAS_DEV) {
    CUSTOMERS_TABLE_NAME = `${CUSTOMERS_TABLE}${DEV_TABLE_SUFFIX}`;
    BOOKINGS_TABLE_NAME = `${BOOKINGS_TABLE}${DEV_TABLE_SUFFIX}`;
    SUB_LOCATIONS_TABLE_NAME = `${SUB_LOCATIONS_TABLE}${DEV_TABLE_SUFFIX}`;
    GROUPS_TABLE_NAME = `${GROUPS_TABLE}${DEV_TABLE_SUFFIX}`;
    TICKET_TABLE_NAME = `${TICKET_TABLE}${DEV_TABLE_SUFFIX}`;
    COUNTER_TABLE_NAME = `${COUNTER_TABLE}${DEV_TABLE_SUFFIX}`;
  } else {
    CUSTOMERS_TABLE_NAME = `${CUSTOMERS_TABLE}${PROD_TABLE_SUFFIX}`;
    BOOKINGS_TABLE_NAME = `${BOOKINGS_TABLE}${PROD_TABLE_SUFFIX}`;
    SUB_LOCATIONS_TABLE_NAME = `${SUB_LOCATIONS_TABLE}${PROD_TABLE_SUFFIX}`;
    GROUPS_TABLE_NAME = `${GROUPS_TABLE}${PROD_TABLE_SUFFIX}`;
    TICKET_TABLE_NAME = `${TICKET_TABLE}${PROD_TABLE_SUFFIX}`;
    COUNTER_TABLE_NAME = `${COUNTER_TABLE}${PROD_TABLE_SUFFIX}`;
  }

  console.log("Bookings table : ", BOOKINGS_TABLE_NAME);
  console.log("Customer table : ", CUSTOMERS_TABLE_NAME);
  console.log("Sublocations table name : ", SUB_LOCATIONS_TABLE_NAME);
  console.log("Groups table name : ", GROUPS_TABLE_NAME);
  console.log("Ticket table name : ", TICKET_TABLE_NAME);
  console.log("Counter table : ", COUNTER_TABLE_NAME);
}

function setAlias(lambdaAlias) {
  LAMBDA_ALIAS = lambdaAlias;
}

module.exports.getBookingTable = () => {
  return BOOKINGS_TABLE_NAME;
};

module.exports.getCustomerTable = () => {
  return CUSTOMERS_TABLE_NAME;
};

module.exports.getSublocationsTable = () => {
  return SUB_LOCATIONS_TABLE_NAME;
};

module.exports.getGroupsTable = () => {
  return GROUPS_TABLE_NAME;
};

module.exports.getTicketTable = () => {
  return TICKET_TABLE_NAME;
};

module.exports.getCounterTable = () => {
  return COUNTER_TABLE_NAME;
};

module.exports.getAlias = () => {
  return LAMBDA_ALIAS;
};

module.exports.initConstants = (event, context) => {
  const functionArn = context.invokedFunctionArn;
  console.log("functionArn", functionArn);
  const lambdaAlias = functionArn.split(":").pop();
  console.log(lambdaAlias);
  setAlias(lambdaAlias);
  configureTableName();
};
