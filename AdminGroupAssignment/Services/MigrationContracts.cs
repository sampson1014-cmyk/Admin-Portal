using System.Globalization;
using System.Text.Json;

namespace AdminGroupAssignment.Services;

public sealed record MigrationField(string Name, string Type, bool Required);
public sealed record MigrationContract(string Kind, string Label, string Endpoint, MigrationField[] Fields);

public static class MigrationContracts
{
    // Swagger field names are deliberately preserved, including provider typos.
    // ! marks required identifiers/linkage; other non-null value types are required.
    private static MigrationContract Define(string kind, string label, string endpoint, string fields) =>
        new(kind, label, "/api/ExcelUploadDate/" + endpoint, fields.Split(' ').Select(token => {
            var pair = token.Split(':');
            var type = pair.Length > 1 ? pair[1] : "string";
            return new MigrationField(pair[0].TrimEnd('!'), type.TrimEnd('?'), pair[0].EndsWith('!') || type != "string" && !type.EndsWith('?'));
        }).ToArray());

    public static readonly MigrationContract[] All = [
        Define("members", "Members", "UploadMembers", "UserId! Name! Email! PhoneNumber! BirthDate ReferralBy FirstLogin ReferralCode Password! Tier Image ImageByte EmailSubcribe RegisterTime:date NotificationStatus AccountStatus DeliveryStatus DeviceId"),
        Define("banners", "Banners", "UploadHighlight", "HighlightId! Image ImageByte Title SubTitle Type Description DescriptionIOS TnC CreateDate:date? ExpireDate:date? ExternalLink ButtonText"),
        Define("rewards", "Rewards and vouchers", "UploadRewardVoucher", "RewardId! Name Image ImageByte Title SubTitle Type Point:integer? ShortTitle Description DescriptionIOS TnC CreateDate:date? ExpireDate:date? Status Category"),
        Define("merchants", "Merchants", "UploadMerchant", "MerchantId! MerchantName! Password! Phone1 Phone2 Fax Image ImageByte Address CreateDate:date Status"),
        Define("outlets", "Outlets", "UploadOutlets", "OutletsId! Status Latitude:number Longitude:number Name! PhoneNumber Address Image ImageByte"),
        Define("wallets", "Wallets", "UploadWallet", "WalletId! UserId! PhoneNumber! Balance:number TotalTopupAmount:number Point:integer? CreateDate:date ExpireDate:date? Status PointBonus:number Tier TotalStamp:integer"),
        Define("topups", "Top-up records", "UploadTopUpRecord", "TopUpId! Description TopupAmount:number Status IsPaid CreateDate:date UpdateTime ReceiptOrLink PhoneNumber! PaymentMethod ReceiptXaml RewardPoint:integer MerchantId! MemberId ReferenceNumber"),
        Define("spends", "Spend records", "UploadSpendRecord", "SpendId! ReferenceNumber PhoneNumber! Amount:number Status IsPaid SpendTime:date UpdateTime PaymentMethod ReceiptXaml RewardPoint:integer UseStampDiscount:boolean DiscountAmount:number GrandAmount:number MerchantId!"),
        Define("redemptions", "Redemption records", "UploadRedeemRecord", "Id:integer Merchant_Id! Reward_Id! Type RedeemDate:date Phone! Description Msg"),
        Define("points", "Point records", "UploadPointRecord", "PointRecordId! Point:integer MemberName MemberPhone! DateAssign:date MerchantId! Description"),
        Define("stampassigns", "Stamp assignments", "UploadStampAssignRecord", "Merchant_Id! AssignRecordId! TotalAssignStamp:integer ReceiveDate:date PhoneNumber! AmountMemberSpend:number Description Status"),
        Define("stamptransactions", "Stamp redemption activity", "UploadStampTrancactionRecord", "Merchant_Id! ReferenceNumber StampTransactionRecordID! TotalUseStamp:integer ClaimDate:date PhoneNumber! Description"),
        Define("stamps", "Stamp records", "UploadStampRecord", "Merchant_Id! FinalStamp:integer? AssignRecordId TotalAssignStamp:integer? ReceiveDate:date PhoneNumber! AmountMemberSpend:number Description Status ReferenceNumber StampTransactionRecordID TotalUseStamp:integer? UseDate:date PaymentMethod ReceiptXaml")
    ];

    public static MigrationContract? Find(string kind) => All.FirstOrDefault(item => item.Kind == kind);
    public static MigrationContract ForArchive(MigrationContract contract) => contract with
    {
        Fields = contract.Fields.Where(field => !field.Name.Contains("Password", StringComparison.OrdinalIgnoreCase)
            && !field.Name.Contains("Secret", StringComparison.OrdinalIgnoreCase)
            && !field.Name.Contains("Token", StringComparison.OrdinalIgnoreCase)).ToArray()
    };

    public static Dictionary<string, object?> Validate(MigrationContract contract, JsonElement row)
    {
        if (row.ValueKind != JsonValueKind.Object) throw new ArgumentException("Each migration row must be an object.");
        var result = new Dictionary<string, object?>();
        foreach (var property in row.EnumerateObject())
        {
            var field = contract.Fields.FirstOrDefault(item => item.Name.Equals(property.Name, StringComparison.OrdinalIgnoreCase));
            if (field == null) throw new ArgumentException($"Unknown column: {property.Name}.");
            if (result.ContainsKey(field.Name)) throw new ArgumentException($"Duplicate column: {field.Name}.");
            if (property.Value.ValueKind == JsonValueKind.Null) {
                if (field.Required) throw new ArgumentException($"{field.Name} is required.");
                result[field.Name] = null; continue;
            }
            object value;
            switch (field.Type)
            {
                case "integer":
                    if (property.Value.ValueKind != JsonValueKind.Number || !property.Value.TryGetInt32(out var integer)) throw new ArgumentException($"{field.Name} must be a whole number.");
                    value = integer; break;
                case "number":
                    if (property.Value.ValueKind != JsonValueKind.Number || !property.Value.TryGetDouble(out var number) || !double.IsFinite(number)) throw new ArgumentException($"{field.Name} must be a finite number.");
                    if (field.Name == "Latitude" && Math.Abs(number) > 90 || field.Name == "Longitude" && Math.Abs(number) > 180)
                        throw new ArgumentException($"{field.Name} is outside its valid coordinate range.");
                    value = number; break;
                case "boolean":
                    if (property.Value.ValueKind != JsonValueKind.True && property.Value.ValueKind != JsonValueKind.False) throw new ArgumentException($"{field.Name} must be true or false.");
                    value = property.Value.GetBoolean(); break;
                default:
                    if (property.Value.ValueKind != JsonValueKind.String) throw new ArgumentException($"{field.Name} must be text.");
                    var text = property.Value.GetString() ?? "";
                    if (field.Required && string.IsNullOrWhiteSpace(text)) throw new ArgumentException($"{field.Name} is required.");
                    if (text.Length > 1024 * 1024) throw new ArgumentException($"{field.Name} is too large.");
                    if (field.Type == "date" && (!text.Contains('T') || !DateTimeOffset.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out _)))
                        throw new ArgumentException($"{field.Name} must be an ISO date-time.");
                    value = text; break;
            }
            result[field.Name] = value;
        }
        foreach (var field in contract.Fields.Where(item => item.Required))
            if (!result.ContainsKey(field.Name)) throw new ArgumentException($"Missing required column: {field.Name}.");
        return result;
    }
}
