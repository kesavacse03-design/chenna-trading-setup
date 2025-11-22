const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const schemaPath = path.join(__dirname, 'backtest-result.schema.json');
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validateFn = ajv.compile(schema);

function validate(obj) {
  const valid = validateFn(obj);
  return { valid, errors: validateFn.errors };
}

module.exports = { validate, schemaPath };
