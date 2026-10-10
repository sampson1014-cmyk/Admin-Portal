using System.Text.Json;
using System.Text.RegularExpressions;

namespace AdminGroupAssignment.Services;

public static class ApiResponseValidation
{
    // Only explicit rejection signals are failures; ordinary records are not.
    public static string? GetFailure(string body)
    {
        if (string.IsNullOrWhiteSpace(body)) return null;
        try
        {
            using var document = JsonDocument.Parse(body);
            var root = document.RootElement;
            if (root.ValueKind == JsonValueKind.False) return "The action was not accepted.";
            if (root.ValueKind == JsonValueKind.String) return TextFailure(root.GetString() ?? "");
            if (root.ValueKind != JsonValueKind.Object) return null;
            foreach (var property in root.EnumerateObject())
            {
                if ((property.Name.Equals("success", StringComparison.OrdinalIgnoreCase) ||
                     property.Name.Equals("isSuccess", StringComparison.OrdinalIgnoreCase)) &&
                    (property.Value.ValueKind == JsonValueKind.False ||
                     property.Value.ValueKind == JsonValueKind.String && property.Value.GetString()?.Equals("false", StringComparison.OrdinalIgnoreCase) == true))
                    return Message(root);
            }
            return null;
        }
        catch (JsonException) { return TextFailure(body); }
    }

    private static string? TextFailure(string text) =>
        Regex.IsMatch(text.Trim(), @"^(false|error\b|failed\b|failure\b|invalid\b|unauthorized\b|.*\bnot found\b|.*\bnot exist\b|.*\bincorrect password\b)", RegexOptions.IgnoreCase)
            ? text.Trim() : null;

    private static string Message(JsonElement root)
    {
        foreach (var name in new[] { "message", "error", "description", "title" })
            foreach (var property in root.EnumerateObject())
                if (property.Name.Equals(name, StringComparison.OrdinalIgnoreCase) && property.Value.ValueKind == JsonValueKind.String)
                    return property.Value.GetString() ?? "The action was not accepted.";
        return "The action was not accepted.";
    }
}
