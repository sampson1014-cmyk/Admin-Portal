LoadDotEnv(Path.Combine(Directory.GetCurrentDirectory(), ".env"));

var builder = WebApplication.CreateBuilder(args);


builder.Services.AddControllersWithViews();

builder.Services.AddHttpClient("XCodeApi", options =>
{
    // The admin portal depends on an external API. Keep a slow or unavailable
    // upstream service from leaving the UI in a loading state for 100 seconds.
    options.Timeout = TimeSpan.FromSeconds(25);
});

builder.Services.AddSession();


var app = builder.Build();


if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Home/Error");

    app.UseHsts();
}


app.UseHttpsRedirection();

app.UseStaticFiles();

app.UseRouting();

app.UseSession();

app.UseAuthorization();


app.MapControllerRoute(
    name: "default",
    pattern:
        "{controller=Admin}/{action=LoginPage}/{id?}"
);


app.Run();


static void LoadDotEnv(string filePath)
{
    if (!File.Exists(filePath))
    {
        return;
    }

    foreach (string rawLine in File.ReadLines(filePath))
    {
        string line = rawLine.Trim();
        if (string.IsNullOrWhiteSpace(line) || line.StartsWith('#'))
        {
            continue;
        }

        int separator = line.IndexOf('=');
        if (separator <= 0)
        {
            continue;
        }

        string key = line[..separator].Trim();
        string value = line[(separator + 1)..].Trim().Trim('"');

        // Values set by the operating system take priority over .env.
        if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable(key)))
        {
            Environment.SetEnvironmentVariable(key, value);
        }
    }
}
