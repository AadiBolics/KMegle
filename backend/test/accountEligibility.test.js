const test = require("node:test");
const assert = require("node:assert/strict");
let claims;
require.cache[require.resolve("../src/config/firebaseAdmin")] = {
  exports: { firebaseAuth: { verifyIdToken: async () => claims } },
};
function helpers(gmail) {
  const previous = process.env.ALLOW_GMAIL_TEST_ACCOUNTS;
  if (gmail === undefined) delete process.env.ALLOW_GMAIL_TEST_ACCOUNTS;
  else process.env.ALLOW_GMAIL_TEST_ACCOUNTS = gmail ? "true" : "false";
  delete require.cache[require.resolve("../src/middleware/authHelpers")];
  const result = require("../src/middleware/authHelpers");
  if (previous === undefined) delete process.env.ALLOW_GMAIL_TEST_ACCOUNTS;
  else process.env.ALLOW_GMAIL_TEST_ACCOUNTS = previous;
  return result;
}
test("verified Gmail and college accounts are accepted during testing; other domains remain rejected", async () => {
  const auth = helpers();
  for (const email of [
    "student@iiitkottayam.ac.in",
    "tester@gmail.com",
    " Tester@GMAIL.COM ",
  ]) {
    claims = { uid: "account-test", email, email_verified: true };
    assert.equal(
      (await auth.verifyFirebaseToken("fake-token")).uid,
      "account-test",
    );
  }
  for (const email of [
    "tester@yahoo.com",
    "tester@gmail.com.evil.test",
    "tester@notgmail.com",
  ]) {
    claims = { uid: "account-test", email, email_verified: true };
    await assert.rejects(
      auth.verifyFirebaseToken("fake-token"),
      (error) => error.code === "ACCOUNT_NOT_ALLOWED",
    );
  }
  claims = {
    uid: "account-test",
    email: "tester@gmail.com",
    email_verified: false,
  };
  await assert.rejects(
    auth.verifyFirebaseToken("fake-token"),
    (error) => error.code === "EMAIL_NOT_VERIFIED",
  );
});
test("the temporary Gmail exception can be disabled without weakening college verification", async () => {
  const auth = helpers(false);
  claims = {
    uid: "account-test",
    email: "tester@gmail.com",
    email_verified: true,
  };
  await assert.rejects(
    auth.verifyFirebaseToken("fake-token"),
    (error) => error.code === "ACCOUNT_NOT_ALLOWED",
  );
  claims.email = "student@iiitkottayam.ac.in";
  assert.equal(
    (await auth.verifyFirebaseToken("fake-token")).uid,
    "account-test",
  );
});
test("HTTP eligibility rejection is a structured 403 instead of a misleading retryable failure", async () => {
  helpers();
  delete require.cache[require.resolve("../src/middleware/httpFIrebaseAuth")];
  const middleware = require("../src/middleware/httpFIrebaseAuth");
  claims = {
    uid: "account-test",
    email: "tester@yahoo.com",
    email_verified: true,
  };
  let status, body;
  const res = {
    status(value) {
      status = value;
      return this;
    },
    json(value) {
      body = value;
    },
  };
  await middleware(
    { headers: { authorization: "Bearer fake-token" } },
    res,
    () => assert.fail("unauthorized request continued"),
  );
  assert.equal(status, 403);
  assert.equal(body.code, "ACCOUNT_NOT_ALLOWED");
  assert.match(body.error, /college|Kottayam|Gmail/);
});
