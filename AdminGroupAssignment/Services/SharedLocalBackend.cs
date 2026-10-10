using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace AdminGroupAssignment.Services;

public static class SharedLocalBackend
{
    public static async Task<string> SendAsync(IHttpClientFactory factory, IConfiguration configuration, string path, object? payload = null)
    {
        var secret = configuration["SharedGateway:SessionSecret"] ?? configuration["APP_JWT_SECRET"];
        if (string.IsNullOrWhiteSpace(secret))
        {
            var file = configuration["SharedGateway:SecretFile"];
            if (!string.IsNullOrWhiteSpace(file) && File.Exists(file))
                secret = File.ReadLines(file).FirstOrDefault(line => line.TrimStart().StartsWith("APP_JWT_SECRET=", StringComparison.Ordinal))?.Split('=', 2)[1].Trim().Trim('"', '\'');
        }
        if (string.IsNullOrWhiteSpace(secret)) throw new InvalidOperationException("Configure SharedGateway:SessionSecret or SharedGateway:SecretFile on the admin server.");
        static string Encode(byte[] bytes) => Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
        var header = Encode(Encoding.UTF8.GetBytes("{\"alg\":\"HS256\",\"typ\":\"JWT\"}"));
        var claims = Encode(JsonSerializer.SerializeToUtf8Bytes(new { role = "admin-service", exp = DateTimeOffset.UtcNow.AddMinutes(1).ToUnixTimeSeconds() }));
        var unsigned = $"{header}.{claims}";
        var token = $"{unsigned}.{Encode(HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret), Encoding.UTF8.GetBytes(unsigned)))}";
        using var client = factory.CreateClient("XCodeApi");
        using var request = new HttpRequestMessage(payload is null ? HttpMethod.Get : HttpMethod.Post,
            (configuration["SharedGateway:BaseUrl"] ?? "http://localhost:3000").TrimEnd('/') + path);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        if (payload is not null) request.Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");
        using var response = await client.SendAsync(request);
        var body = await response.Content.ReadAsStringAsync();
        if (!response.IsSuccessStatusCode) throw new InvalidOperationException($"The shared backend rejected the request (HTTP {(int)response.StatusCode}). {body}");
        return body;
    }
}
