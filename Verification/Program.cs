using AdminGroupAssignment.Services;

var cases = new (string Body, bool Fails)[] {
    ("Staff Not Found", true),
    ("\"Staff Not Found\"", true),
    ("Invalid password", true),
    ("false", true),
    ("{\"success\":false,\"message\":\"Not allowed\"}", true),
    ("{\"IsSuccess\":\"false\"}", true),
    ("{\"success\":true}", false),
    ("Successfully updated", false),
    ("[]", false),
    ("", false),
    ("[{\"Status\":\"Failed\"}]", false),
    ("{\"Id\":1,\"Status\":\"Failed\"}", false),
    ("{\"Description\":\"Staff not found in old notes\"}", false)
};
foreach (var (body, fails) in cases)
    if ((ApiResponseValidation.GetFailure(body) != null) != fails)
        throw new Exception($"Incorrect classification for {body}");
if (ApiResponseValidation.GetFailure("{\"success\":false,\"message\":\"Not allowed\"}") != "Not allowed")
    throw new Exception("The provider's error message was lost.");
Console.WriteLine($"{cases.Length + 1} response validation checks passed. No API writes were made.");

var migrationChecks = 0;
System.Text.Json.JsonElement Row(object data) => System.Text.Json.JsonSerializer.SerializeToElement(data);
Dictionary<string, object?> Example(MigrationContract contract) => contract.Fields.Where(field => field.Required).ToDictionary(field => field.Name, field => field.Type switch {
    "integer" => (object?)1, "number" => 1.0, "boolean" => false,
    "date" => "2026-10-10T00:00:00Z", _ => "original-value"
});
void Reject(string kind, object data) {
    try { MigrationContracts.Validate(MigrationContracts.Find(kind)!, Row(data)); }
    catch (ArgumentException) { migrationChecks++; return; }
    throw new Exception($"Invalid {kind} row was accepted.");
}
foreach (var contract in MigrationContracts.All) {
    var source = Example(contract);
    var validated = MigrationContracts.Validate(contract, Row(source));
    if (validated.Count != source.Count) throw new Exception("A required field was lost.");
    migrationChecks++;
}
Reject("members", new { Unexpected = "column" });
Reject("members", new { UserId = "member-id" });
var wallet = Example(MigrationContracts.Find("wallets")!);
wallet["Balance"] = "100"; Reject("wallets", wallet);
wallet["Balance"] = 100; wallet["TotalStamp"] = 1.5; Reject("wallets", wallet);
wallet["TotalStamp"] = 1; wallet["CreateDate"] = "not-a-date"; Reject("wallets", wallet);
wallet["CreateDate"] = "2026-10-10T00:00:00Z"; wallet["UserId"] = null; Reject("wallets", wallet);
var outlet = Example(MigrationContracts.Find("outlets")!); outlet["Longitude"] = 678; Reject("outlets", outlet);
var spend = Example(MigrationContracts.Find("spends")!); spend["UseStampDiscount"] = "false"; Reject("spends", spend);
var member = Example(MigrationContracts.Find("members")!); member["Password"] = "  original secret  ";
if ((string?)MigrationContracts.Validate(MigrationContracts.Find("members")!, Row(member))["Password"] != "  original secret  ") throw new Exception("Password was changed.");
migrationChecks++;
if (!MigrationContracts.Find("stamptransactions")!.Endpoint.EndsWith("UploadStampTrancactionRecord")) throw new Exception("Provider endpoint spelling changed.");
migrationChecks++;
Console.WriteLine($"{migrationChecks} migration contract checks passed. No API writes were made.");
