import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { defaultSeedStage, parseAccounts } from "../../scripts/lib/seed-accounts.mjs";

describe("Seed accounts file", () => {
  test("header, comments, blank lines, role labels, default stage", () => {
    const { accounts, errors } = parseAccounts([
      "# accounts",
      "email,first_name,last_name,role,stage",
      "",
      "Admin@Example.com,Ada,Admin,Admin,full_productive",
      "sales@example.com,Sam,Seller,Sales Manager,",
      "rae@example.com,Rae,,recruiter,onboarding",
    ].join("\r\n"));
    assert.deepEqual(errors, []);
    assert.deepEqual(accounts, [
      { email: "admin@example.com", firstName: "Ada", lastName: "Admin", role: "admin", stage: "full_productive" },
      { email: "sales@example.com", firstName: "Sam", lastName: "Seller", role: "sales_manager", stage: defaultSeedStage },
      { email: "rae@example.com", firstName: "Rae", lastName: "", role: "recruiter", stage: "onboarding" },
    ]);
  });

  test("columns may come in any order and the optional ones may be absent", () => {
    const { accounts, errors } = parseAccounts("role,email,last_name,first_name\nadmin,a@example.com,Admin,Ada\n");
    assert.deepEqual(errors, []);
    assert.deepEqual(accounts, [{ email: "a@example.com", firstName: "Ada", lastName: "Admin", role: "admin", stage: defaultSeedStage }]);
  });

  test("every bad row is reported with its line number and nothing is accepted from it", () => {
    const { accounts, errors } = parseAccounts([
      "email,first_name,last_name,role,stage",
      "not-an-email,Ada,Admin,admin,",
      "b@example.com,,Blank,sales_manager,",
      "c@example.com,Cy,Role,marketing,",
      "d@example.com,Di,Stage,recruiter,retired",
      "f@example.com,Fay,First,recruiter,",
      "F@example.com,Fay,Again,admin,",
    ].join("\n"));
    assert.equal(accounts.length, 1);
    assert.equal(accounts[0].email, "f@example.com");
    assert.deepEqual(errors, [
      "line 2: email is not valid",
      "line 3: first_name is empty",
      "line 4: role must be one of admin, sales_manager, recruiter",
      "line 5: stage must be one of onboarding, training, full_productive",
      "line 7: email appears more than once",
    ]);
  });

  test("a missing or wrong header is the only error", () => {
    assert.deepEqual(parseAccounts("# nothing here\n\n").errors, ["the file has no header line (email,first_name,last_name,role[,stage])"]);
    const wrong = parseAccounts("email,name,role\na@example.com,Ada,admin\n");
    assert.equal(wrong.accounts.length, 0);
    assert.equal(wrong.errors.length, 1);
    assert.match(wrong.errors[0], /line 1: .*unknown column name; missing first_name, last_name/);
  });
});
