using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using AdminGroupAssignment.Models;
using Microsoft.AspNetCore.Mvc;

namespace AdminGroupAssignment.Controllers
{
    public class AdminController : Controller
    {
        // =========================================================
        // CONFIGURATION
        // =========================================================

        private const string DefaultApiBaseUrl =
            "https://xcodeappapi.xcode.com.my";

        private const string TokenSessionKey =
            "AdminToken";

        private const string ApiTokenSessionKey =
            "ApiToken";

        private const string ApiUsernameSessionKey =
            "ApiUsername";

        private const string UsernameSessionKey =
            "AdminUsername";

        private const string RoleSessionKey =
            "AdminRole";


        private readonly IHttpClientFactory _httpClientFactory;
        private readonly IConfiguration _configuration;

        private string ApiBaseUrl =>
            NormalizeApiBaseUrl(
                _configuration["XCODE_API_BASE_URL"]
                ?? DefaultApiBaseUrl
            );

        private string ApiAuthorizationUrl =>
            ApiBaseUrl + "/api/" +
            (_configuration["XCODE_AUTH_PATH"] ?? "JWTToken/Post")
                .TrimStart('/');


        // =========================================================
        // CONSTRUCTOR
        // =========================================================

        public AdminController(
            IHttpClientFactory httpClientFactory,
            IConfiguration configuration)
        {
            _httpClientFactory =
                httpClientFactory;
            _configuration = configuration;
        }


        // =========================================================
        // LOGIN
        // =========================================================

        [HttpGet]
        public IActionResult LoginPage()
        {
            if (IsLoggedIn())
            {
                return RedirectToAction(
                    nameof(Dashboard)
                );
            }

            return View();
        }


        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> LoginPage(
            string Username,
            string Password)
        {
            if (
                string.IsNullOrWhiteSpace(
                    Username
                ) ||
                string.IsNullOrWhiteSpace(
                    Password
                )
            )
            {
                ViewBag.Error =
                    "Please enter username and password.";

                return View();
            }


            try
            {
                HttpClient client =
                    _httpClientFactory.CreateClient("XCodeApi");


                string url =
                    ApiAuthorizationUrl +
                    "?UserName=" +
                    Uri.EscapeDataString(
                        Username
                    ) +
                    "&Password=" +
                    Uri.EscapeDataString(
                        Password
                    );


                HttpResponseMessage response =
                    await client.PostAsync(
                        url,
                        null
                    );


                string body =
                    await response.Content
                        .ReadAsStringAsync();


                Console.WriteLine(
                    $"[LOGIN] {(int)response.StatusCode} {response.StatusCode}"
                );


                if (!response.IsSuccessStatusCode)
                {
                    ViewBag.Error =
                        "Invalid username or password.";

                    return View();
                }


                string token =
                    ExtractToken(body);


                if (
                    string.IsNullOrWhiteSpace(
                        token
                    )
                )
                {
                    ViewBag.Error =
                        "Sign-in worked, but the server returned no token.";

                    return View();
                }


                HttpContext.Session.SetString(
                    TokenSessionKey,
                    token
                );


                HttpContext.Session.SetString(
                    UsernameSessionKey,
                    Username
                );


                HttpContext.Session.SetString(
                    RoleSessionKey,
                    "admin"
                );


                return RedirectToAction(
                    nameof(Dashboard)
                );
            }
            catch (Exception ex)
            {
                Console.WriteLine(
                    "[LOGIN ERROR] " +
                    ex.Message
                );


                ViewBag.Error =
                    "Cannot reach the server: " +
                    ex.Message;

                return View();
            }
        }


        // =========================================================
        // LOGOUT
        // =========================================================

        [HttpGet]
        public IActionResult Logout()
        {
            HttpContext.Session.Clear();

            return RedirectToAction(
                nameof(LoginPage)
            );
        }


        // =========================================================
        // API AUTHORIZATION
        // =========================================================

        [HttpGet]
        public IActionResult ApiAuthorization()
        {
            if (!IsLoggedIn())
            {
                return RedirectToAction(nameof(LoginPage));
            }

            ViewBag.ApiUsername =
                HttpContext.Session.GetString(ApiUsernameSessionKey)
                ?? _configuration["XCODE_API_USERNAME"];
            ViewBag.IsApiAuthorized =
                !string.IsNullOrWhiteSpace(
                    HttpContext.Session.GetString(ApiTokenSessionKey));
            ViewBag.Success = TempData["ApiAuthorizationSuccess"];
            ViewBag.Error = TempData["ApiAuthorizationError"];
            return View();
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> SaveApiAuthorization(
            string Username,
            string Password)
        {
            if (!IsLoggedIn())
            {
                return RedirectToAction(nameof(LoginPage));
            }

            Username = string.IsNullOrWhiteSpace(Username)
                ? _configuration["XCODE_API_USERNAME"] ?? ""
                : Username;

            Password = string.IsNullOrWhiteSpace(Password)
                ? _configuration["XCODE_API_PASSWORD"] ?? ""
                : Password;

            if (string.IsNullOrWhiteSpace(Username) ||
                string.IsNullOrWhiteSpace(Password))
            {
                TempData["ApiAuthorizationError"] =
                    "Enter the API username and password.";
                return RedirectToAction(nameof(ApiAuthorization));
            }

            try
            {
                using HttpClient client = _httpClientFactory.CreateClient("XCodeApi");
                string url =
                    ApiAuthorizationUrl +
                    "?UserName=" + Uri.EscapeDataString(Username) +
                    "&Password=" + Uri.EscapeDataString(Password);

                using HttpResponseMessage response =
                    await client.PostAsync(url, content: null);
                string body = await response.Content.ReadAsStringAsync();

                if (!response.IsSuccessStatusCode)
                {
                    TempData["ApiAuthorizationError"] =
                        $"API authorization failed (HTTP {(int)response.StatusCode}).";
                    return RedirectToAction(nameof(ApiAuthorization));
                }

                string token = ExtractToken(body);
                if (string.IsNullOrWhiteSpace(token))
                {
                    TempData["ApiAuthorizationError"] =
                        "The API did not return a JWT token.";
                    return RedirectToAction(nameof(ApiAuthorization));
                }

                HttpContext.Session.SetString(ApiTokenSessionKey, token);
                HttpContext.Session.SetString(ApiUsernameSessionKey, Username.Trim());
                TempData["ApiAuthorizationSuccess"] =
                    "API authorization connected. API requests will use this JWT.";
            }
            catch (Exception ex)
            {
                TempData["ApiAuthorizationError"] =
                    "Could not authorize with the API: " + ex.Message;
            }

            return RedirectToAction(nameof(ApiAuthorization));
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        public IActionResult ClearApiAuthorization()
        {
            HttpContext.Session.Remove(ApiTokenSessionKey);
            HttpContext.Session.Remove(ApiUsernameSessionKey);
            TempData["ApiAuthorizationSuccess"] =
                "API authorization cleared.";
            return RedirectToAction(nameof(ApiAuthorization));
        }


        // =========================================================
        // DASHBOARD
        // =========================================================

        [HttpGet]
        public IActionResult Dashboard()
        {
            if (!IsLoggedIn())
            {
                return RedirectToAction(
                    nameof(LoginPage)
                );
            }


            ViewBag.Username =
                HttpContext.Session.GetString(
                    UsernameSessionKey
                ) ?? "admin";


            return View();
        }


        [HttpGet]
        public async Task<IActionResult> DashboardData()
        {
            if (!IsLoggedIn())
            {
                return Unauthorized(
                    new
                    {
                        success = false,
                        message =
                            "Session expired."
                    }
                );
            }


            var merchants =
                new Lazy<Task<string>>(
                    () =>
                        GetApiJson(
                            "/api/ManageMerchant/GetAllMerchant"
                        )
                );


            var sources =
                new Dictionary<
                    string,
                    Func<Task<string>>
                >
                {
                    // =====================================================
                    // PEOPLE
                    // =====================================================

                    ["Members"] =
                        () =>
                            GetApiJson(
                                "/api/ManageMember/GetAllMember"
                            ),

                    ["Merchants"] =
                        () =>
                            merchants.Value,

                    ["Outlets"] =
                        () =>
                            GetApiJson(
                                "/api/ManageOutlets/GetAllOutlets"
                            ),

                    ["Staff"] =
                        () =>
                            GetAllStaffJson(
                                null,
                                merchants.Value
                            ),


                    // =====================================================
                    // CONTENT / ACTIVITY
                    // =====================================================

                    ["Orders"] =
                        () =>
                            GetApiJson(
                                "/api/ManageDelivery/OrderHistoriesList"
                            ),

                    ["MenuItems"] =
                        () =>
                            GetApiJson(
                                "/api/ManageMenu/GetMenuList"
                            ),

                    ["Feedback"] =
                        () =>
                            GetApiJson(
                                "/api/FeedBack/GetAllFeedbackList"
                            ),

                    ["Rewards"] =
                        () =>
                            GetApiJson(
                                "/api/ManageRewards/GetAllRewards"
                            ),

                    ["StampCampaigns"] =
                        () =>
                            GetApiJson(
                                "/api/ManageStamp/GetAllStamps"
                            ),

                    ["Banners"] =
                        () =>
                            GetApiJson(
                                "/api/ManageHighlight/GetAllHighlight"
                            ),


                    // =====================================================
                    // TRANSACTIONS
                    // =====================================================

                    ["TopUps"] =
                        () =>
                            GetApiJson(
                                "/api/ManageTransaction/GetAllTopupRecords"
                            ),

                    ["Spends"] =
                        () =>
                            GetApiJson(
                                "/api/MerchantTransactionHistories/GetAllSpendRecords"
                            ),

                    ["RewardRedemptions"] =
                        () =>
                            GetApiJson(
                                "/api/ManageTransaction/GetAllRewardRecords"
                            ),

                    ["Vouchers"] =
                        () =>
                            GetApiJson(
                                "/api/ManageTransaction/GetAllVoucherRecords"
                            ),

                    ["StampRecords"] =
                        () =>
                            GetApiJson(
                                "/api/MerchantTransactionHistories/GetAllStampRecords"
                            ),

                    ["PointAssigns"] =
                        () =>
                            PostApiJson(
                                "/api/ManagePoint/GetAllPointAssignRecord",
                                null
                            ),


                    // =====================================================
                    // SYSTEM
                    // =====================================================

                    ["AppVersions"] =
                        () =>
                            GetApiJson(
                                "/api/ManageVersion/GetAllVersion"
                            )
                };


            static string Short(
                string message)
            {
                message =
                    message
                        .Replace(
                            "\r",
                            " "
                        )
                        .Replace(
                            "\n",
                            " "
                        )
                        .Trim();


                return
                    message.Length > 120
                        ? message[..120] + "..."
                        : message;
            }


            async Task<
                (
                    string Key,
                    int Count,
                    string? Error,
                    bool Unauthorized
                )
            >
            CountTask(
                string key,
                Func<Task<string>> fetch)
            {
                try
                {
                    string json =
                        await fetch();


                    return (
                        key,
                        CountJsonArray(json),
                        null,
                        false
                    );
                }
                catch (ApiException ex)
                {
                    return (
                        key,
                        0,
                        $"{key}: {Short(ex.Message)}",
                        ex.StatusCode == 401
                    );
                }
                catch (Exception ex)
                {
                    return (
                        key,
                        0,
                        $"{key}: {Short(ex.Message)}",
                        false
                    );
                }
            }


            var results =
                await Task.WhenAll(
                    sources.Select(
                        kv =>
                            CountTask(
                                kv.Key,
                                kv.Value
                            )
                    )
                );


            if (
                results.Any(
                    r =>
                        r.Unauthorized
                )
            )
            {
                HttpContext.Session.Clear();


                return Unauthorized(
                    new
                    {
                        success = false,
                        message =
                            "Session expired."
                    }
                );
            }


            var model =
                new DashboardViewModel();


            var modelType =
                typeof(
                    DashboardViewModel
                );


            foreach (var r in results)
            {
                if (r.Error != null)
                {
                    model.Errors.Add(
                        r.Error
                    );

                    continue;
                }


                modelType
                    .GetProperty(
                        r.Key
                    )
                    ?.SetValue(
                        model,
                        r.Count
                    );
            }


            model.ApiConnected =
                model.Errors.Count <
                results.Length;


            model.LastUpdated =
                DateTime.Now.ToString(
                    "dd MMM yyyy HH:mm:ss"
                );


            return Json(model);
        }


        // =========================================================
        // MEMBERS PAGE
        // =========================================================

        [HttpGet]
        public async Task<IActionResult> Members()
        {
            if (!IsLoggedIn())
            {
                if (IsAjaxRequest())
                {
                    return Unauthorized(
                        new
                        {
                            success = false,
                            message =
                                "Session expired."
                        }
                    );
                }


                return RedirectToAction(
                    nameof(LoginPage)
                );
            }


            if (!IsAjaxRequest())
            {
                return View();
            }


            try
            {
                string json =
                    await GetApiJson(
                        "/api/ManageMember/GetAllMember"
                    );


                Response.Headers.CacheControl =
                    "no-store";


                Console.WriteLine(
                    "[MEMBER LIST] GET /api/ManageMember/GetAllMember"
                );


                Console.WriteLine(
                    "[MEMBER LIST] HTTP 200"
                );


                return Content(
                    json,
                    "application/json"
                );
            }
            catch (ApiException ex)
            {
                Console.WriteLine(
                    "[MEMBER LIST API ERROR] " +
                    ex.StatusCode +
                    " - " +
                    ex.Message
                );


                if (
                    ex.StatusCode ==
                    401
                )
                {
                    HttpContext.Session.Clear();
                }


                return StatusCode(
                    ex.StatusCode,
                    new
                    {
                        success = false,
                        message =
                            ex.Message
                    }
                );
            }
            catch (Exception ex)
            {
                Console.WriteLine(
                    "[MEMBER LIST ERROR] " +
                    ex.Message
                );


                return StatusCode(
                    500,
                    new
                    {
                        success = false,
                        message =
                            ex.Message
                    }
                );
            }
        }


        // =========================================================
        // FIND MEMBER
        // =========================================================

        [HttpGet]
        public Task<IActionResult> FindMemberById(
            int id)
        {
            return Proxy(
                () =>
                {
                    if (id <= 0)
                    {
                        throw new ApiException(
                            400,
                            "Invalid member ID."
                        );
                    }


                    return GetApiJson(
                        $"/api/ManageMember/FindMemberById?Id={id}"
                    );
                }
            );
        }


        // =========================================================
        // CREATE MEMBER
        // =========================================================

        [HttpPost]
        public Task<IActionResult> CreateMember(
            [FromBody] JsonElement body)
        {
            return Proxy(
                () =>
                {
                    if (
                        body.ValueKind !=
                        JsonValueKind.Object
                    )
                    {
                        throw new ApiException(
                            400,
                            "Invalid member data."
                        );
                    }


                    string name =
                        GetString(
                            body,
                            "Name"
                        );


                    string email =
                        GetString(
                            body,
                            "Email"
                        );


                    string phoneNumber =
                        GetString(
                            body,
                            "PhoneNumber"
                        );


                    string birthDate =
                        GetString(
                            body,
                            "BirthDate"
                        );


                    string referralBy =
                        GetString(
                            body,
                            "ReferralBy"
                        );


                    string password =
                        GetString(
                            body,
                            "Password"
                        );


                    string tier =
                        GetString(
                            body,
                            "Tier"
                        );


                    string image =
                        GetString(
                            body,
                            "Image"
                        );


                    string imageByte =
                        GetString(
                            body,
                            "ImageByte"
                        );


                    string emailSubcribe =
                        GetString(
                            body,
                            "EmailSubcribe"
                        );


                    string notificationStatus =
                        GetString(
                            body,
                            "NotificationStatus"
                        );


                    string accountStatus =
                        GetString(
                            body,
                            "AccountStatus"
                        );


                    string deviceId =
                        GetString(
                            body,
                            "DeviceId"
                        );


                    // =====================================================
                    // VALIDATION
                    // =====================================================

                    if (
                        string.IsNullOrWhiteSpace(
                            name
                        )
                    )
                    {
                        throw new ApiException(
                            400,
                            "Member name is required."
                        );
                    }


                    if (
                        string.IsNullOrWhiteSpace(
                            email
                        )
                    )
                    {
                        throw new ApiException(
                            400,
                            "Email is required."
                        );
                    }


                    if (
                        string.IsNullOrWhiteSpace(
                            phoneNumber
                        )
                    )
                    {
                        throw new ApiException(
                            400,
                            "Phone number is required."
                        );
                    }


                    if (
                        string.IsNullOrWhiteSpace(
                            password
                        )
                    )
                    {
                        throw new ApiException(
                            400,
                            "Password is required."
                        );
                    }


                    // =====================================================
                    // DEFAULT VALUES
                    // =====================================================

                    referralBy =
                        string.IsNullOrWhiteSpace(
                            referralBy
                        )
                            ? "N/A"
                            : referralBy;


                    emailSubcribe =
                        string.IsNullOrWhiteSpace(
                            emailSubcribe
                        )
                            ? "No"
                            : emailSubcribe;


                    notificationStatus =
                        string.IsNullOrWhiteSpace(
                            notificationStatus
                        )
                            ? "Active"
                            : notificationStatus;


                    accountStatus =
                        string.IsNullOrWhiteSpace(
                            accountStatus
                        )
                            ? "Active"
                            : accountStatus;


                    tier =
                        string.IsNullOrWhiteSpace(
                            tier
                        )
                            ? "Bronze"
                            : tier;


                    var data =
                        new
                        {
                            Id = 0,

                            Name =
                                name,

                            Email =
                                email,

                            PhoneNumber =
                                phoneNumber,

                            BirthDate =
                                birthDate,

                            ReferralBy =
                                referralBy,

                            Password =
                                password,

                            Tier =
                                tier,

                            Image =
                                image,

                            ImageByte =
                                imageByte,

                            EmailSubcribe =
                                emailSubcribe,

                            NotificationStatus =
                                notificationStatus,

                            AccountStatus =
                                accountStatus,

                            DeviceId =
                                deviceId
                        };


                    Console.WriteLine(
                        $"[MEMBER CREATE] {name} / {email}"
                    );


                    return PostApiJson(
                        "/api/ManageMember/CreateMember",
                        data
                    );
                }
            );
        }


        // =========================================================
        // EDIT MEMBER
        // =========================================================

        [HttpPost]
        public Task<IActionResult> EditMember(
            [FromBody] JsonElement body)
        {
            return Proxy(
                () =>
                {
                    if (
                        body.ValueKind !=
                        JsonValueKind.Object
                    )
                    {
                        throw new ApiException(
                            400,
                            "Invalid member data."
                        );
                    }


                    int id =
                        GetInt(
                            body,
                            "Id"
                        );


                    if (id <= 0)
                    {
                        throw new ApiException(
                            400,
                            "Invalid member ID."
                        );
                    }


                    string userId =
                        GetString(
                            body,
                            "UserId"
                        );


                    string name =
                        GetString(
                            body,
                            "Name"
                        );


                    string email =
                        GetString(
                            body,
                            "Email"
                        );


                    string phoneNumber =
                        GetString(
                            body,
                            "PhoneNumber"
                        );


                    string birthDate =
                        GetString(
                            body,
                            "BirthDate"
                        );


                    string referralCode =
                        GetString(
                            body,
                            "ReferralCode"
                        );


                    string referralBy =
                        GetString(
                            body,
                            "ReferralBy"
                        );


                    string password =
                        GetString(
                            body,
                            "Password"
                        );


                    string tier =
                        GetString(
                            body,
                            "Tier"
                        );


                    string image =
                        GetString(
                            body,
                            "Image"
                        );


                    string imageByte =
                        GetString(
                            body,
                            "ImageByte"
                        );


                    string firstLogin =
                        GetString(
                            body,
                            "FirstLogin"
                        );


                    string emailSubcribe =
                        GetString(
                            body,
                            "EmailSubcribe"
                        );


                    string notificationStatus =
                        GetString(
                            body,
                            "NotificationStatus"
                        );


                    string accountStatus =
                        GetString(
                            body,
                            "AccountStatus"
                        );


                    string registerTime =
                        GetString(
                            body,
                            "RegisterTime"
                        );


                    string deviceId =
                        GetString(
                            body,
                            "DeviceId"
                        );


                    if (
                        string.IsNullOrWhiteSpace(
                            name
                        )
                    )
                    {
                        throw new ApiException(
                            400,
                            "Member name is required."
                        );
                    }


                    if (
                        string.IsNullOrWhiteSpace(
                            email
                        )
                    )
                    {
                        throw new ApiException(
                            400,
                            "Email is required."
                        );
                    }


                    referralBy =
                        string.IsNullOrWhiteSpace(
                            referralBy
                        )
                            ? "N/A"
                            : referralBy;


                    tier =
                        string.IsNullOrWhiteSpace(
                            tier
                        )
                            ? "Bronze"
                            : tier;


                    emailSubcribe =
                        string.IsNullOrWhiteSpace(
                            emailSubcribe
                        )
                            ? "No"
                            : emailSubcribe;


                    notificationStatus =
                        string.IsNullOrWhiteSpace(
                            notificationStatus
                        )
                            ? "Active"
                            : notificationStatus;


                    accountStatus =
                        string.IsNullOrWhiteSpace(
                            accountStatus
                        )
                            ? "Active"
                            : accountStatus;


                    var data =
                        new
                        {
                            Id =
                                id,

                            UserId =
                                userId,

                            Name =
                                name,

                            Email =
                                email,

                            PhoneNumber =
                                phoneNumber,

                            BirthDate =
                                birthDate,

                            ReferralCode =
                                referralCode,

                            ReferralBy =
                                referralBy,

                            Password =
                                password,

                            Tier =
                                tier,

                            Image =
                                image,

                            ImageByte =
                                imageByte,

                            FirstLogin =
                                firstLogin,

                            EmailSubcribe =
                                emailSubcribe,

                            NotificationStatus =
                                notificationStatus,

                            AccountStatus =
                                accountStatus,

                            RegisterTime =
                                registerTime,

                            DeviceId =
                                deviceId
                        };


                    Console.WriteLine(
                        $"[MEMBER EDIT] Id={id}"
                    );


                    return PostApiJson(
                        "/api/ManageMember/EditMember",
                        data
                    );
                }
            );
        }


        // =========================================================
        // DELETE MEMBER
        // =========================================================

        [HttpPost]
        public Task<IActionResult> DeleteMember(
            [FromQuery] int id)
        {
            return Proxy(
                () =>
                {
                    if (id <= 0)
                    {
                        throw new ApiException(
                            400,
                            "Invalid member ID."
                        );
                    }


                    Console.WriteLine(
                        $"[MEMBER DELETE API] POST /api/ManageMember/DeleteMemberbyId?Id={id}"
                    );


                    return PostApiJson(
                        $"/api/ManageMember/DeleteMemberbyId?Id={id}",
                        null
                    );
                }
            );
        }


        // =========================================================
        // MENU
        // =========================================================

        [HttpGet]
        public Task<IActionResult> Menu() =>
            PageOrJson(
                "/api/ManageMenu/GetMenuList"
            );


        [HttpPost]
        public Task<IActionResult> CreateMenuItem(
            [FromBody] MenuItemRequest request) =>
            ProxyPost(
                "/api/ManageMenu/CreateMenuItem",
                request
            );


        [HttpPost]
        public Task<IActionResult> EditMenu(
            [FromBody] MenuItemRequest request) =>
            ProxyPost(
                "/api/ManageMenu/EditMenu",
                request
            );


        [HttpPost]
        public Task<IActionResult> EditSubMenuItem(
            [FromBody] MenuSubItemRequest request) =>
            ProxyPost(
                "/api/ManageMenu/EditSubMenuItem",
                request
            );


        [HttpPost]
        public Task<IActionResult> DeleteMenu(
            [FromBody] MenuIdRequest request) =>
            ProxyPost(
                "/api/ManageMenu/DeleteMenu",
                request
            );


        [HttpPost]
        public Task<IActionResult> DeleteMenuById(
            int id) =>
            ProxyPost(
                $"/api/ManageMenu/DeleteMenuById?id={id}",
                null
            );


        // =========================================================
        // OTHER PAGES
        // =========================================================

        [HttpGet]
        public IActionResult Merchants() =>
            RedirectToAction(nameof(MerchantList));

        [HttpGet]
        public IActionResult MerchantList()
        {
            return View();
        }

        // ==================================================
        // GET ALL MERCHANTS
        // ==================================================

        [HttpGet]
        public async Task<IActionResult> GetAllMerchants()
        {
            try
            {
                string? token =
                    HttpContext.Session.GetString(
                        TokenSessionKey
                    );


                if (string.IsNullOrWhiteSpace(token))
                {
                    return Unauthorized(new
                    {
                        success = false,
                        message = "Please log in first."
                    });
                }


                using HttpClient client =
                    CreateHttpClient();


                string url =
                    ApiBaseUrl +
                    "/api/ManageMerchant/GetAllMerchant";


                HttpResponseMessage response =
                    await client.GetAsync(url);


                string json =
                    await response.Content.ReadAsStringAsync();


                if (!response.IsSuccessStatusCode)
                {
                    return StatusCode(
                        (int)response.StatusCode,
                        new
                        {
                            success = false,
                            message = json
                        }
                    );
                }


                return Content(
                    json,
                    "application/json"
                );
            }
            catch (Exception ex)
            {
                return StatusCode(
                    500,
                    new
                    {
                        success = false,
                        message = ex.Message
                    }
                );
            }
        }



        // ==================================================
        // FIND MERCHANT BY ID
        // REAL API:
        // /api/ManageMerchant/FindMerchantById?id=1
        // ==================================================

        [HttpGet]
        public async Task<IActionResult> GetMerchantById(int id)
        {
            try
            {
                string? token =
                    HttpContext.Session.GetString(
                        TokenSessionKey
                    );


                if (string.IsNullOrWhiteSpace(token))
                {
                    return Unauthorized(new
                    {
                        success = false,
                        message = "Please log in first."
                    });
                }


                if (id <= 0)
                {
                    return BadRequest(new
                    {
                        success = false,
                        message = "Invalid merchant ID."
                    });
                }


                using HttpClient client =
                    CreateHttpClient();


                string url =
                    ApiBaseUrl +
                    "/api/ManageMerchant/FindMerchantById?id=" +
                    id;


                HttpResponseMessage response =
                    await client.GetAsync(url);


                // FindMerchantById is not marked as GET in the API
                // requirements. Retry with POST if GET is rejected.
                if (
                    response.StatusCode ==
                    System.Net.HttpStatusCode.MethodNotAllowed
                )
                {
                    response.Dispose();
                    response =
                        await client.PostAsync(url, content: null);
                }


                string json =
                    await response.Content.ReadAsStringAsync();

                if (response.Headers.TryGetValues("Allow", out IEnumerable<string>? allowedMethods))
                {
                    Response.Headers["Allow"] =
                        string.Join(", ", allowedMethods);
                }


                return new ContentResult
                {
                    Content = json,

                    ContentType =
                        response.Content.Headers.ContentType?.ToString()
                        ?? "application/json",

                    StatusCode =
                        (int)response.StatusCode
                };
            }
            catch (Exception ex)
            {
                return StatusCode(
                    500,
                    new
                    {
                        success = false,
                        message = ex.Message
                    }
                );
            }
        }



        // ==================================================
        // CREATE MERCHANT
        // ==================================================

        [HttpPost]
        public async Task<IActionResult> CreateMerchant()
        {
            try
            {
                string? token =
                    HttpContext.Session.GetString(
                        TokenSessionKey
                    );


                if (string.IsNullOrWhiteSpace(token))
                {
                    return Unauthorized(new
                    {
                        success = false,
                        message = "Please log in first."
                    });
                }


                JsonElement data =
                    await Request.ReadFromJsonAsync<JsonElement>();


                using HttpClient client =
                    CreateHttpClient();


                string url =
                    ApiBaseUrl +
                    "/api/ManageMerchant/CreateMerchant";


                HttpRequestMessage request =
                    new HttpRequestMessage(
                        HttpMethod.Post,
                        url
                    );


                request.Content =
                    JsonContent.Create(data);


                HttpResponseMessage response =
                    await client.SendAsync(request);


                /*
                 * If API does not accept POST,
                 * try PUT automatically.
                 */

                if (
                    response.StatusCode ==
                    System.Net.HttpStatusCode.MethodNotAllowed
                )
                {
                    request.Dispose();

                    request =
                        new HttpRequestMessage(
                            HttpMethod.Put,
                            url
                        );

                    request.Content =
                        JsonContent.Create(data);


                    response =
                        await client.SendAsync(request);
                }


                string json =
                    await response.Content.ReadAsStringAsync();


                return new ContentResult
                {
                    Content = json,

                    ContentType =
                        "application/json",

                    StatusCode =
                        (int)response.StatusCode
                };
            }
            catch (Exception ex)
            {
                return StatusCode(
                    500,
                    new
                    {
                        success = false,
                        message = ex.Message
                    }
                );
            }
        }



        // ==================================================
        // EDIT MERCHANT
        // ==================================================

        [HttpPost]
        public async Task<IActionResult> EditMerchant()
        {
            try
            {
                string? token =
                    HttpContext.Session.GetString(
                        TokenSessionKey
                    );


                if (string.IsNullOrWhiteSpace(token))
                {
                    return Unauthorized(new
                    {
                        success = false,
                        message = "Please log in first."
                    });
                }


                JsonElement data =
                    await Request.ReadFromJsonAsync<JsonElement>();


                using HttpClient client =
                    CreateHttpClient();


                string url =
                    ApiBaseUrl +
                    "/api/ManageMerchant/EditMerchant";


                /*
                 * Try PUT first.
                 */

                HttpRequestMessage request =
                    new HttpRequestMessage(
                        HttpMethod.Put,
                        url
                    );


                request.Content =
                    JsonContent.Create(data);


                HttpResponseMessage response =
                    await client.SendAsync(request);


                /*
                 * If PUT is not accepted,
                 * try POST.
                 */

                if (
                    response.StatusCode ==
                    System.Net.HttpStatusCode.MethodNotAllowed
                )
                {
                    request.Dispose();

                    request =
                        new HttpRequestMessage(
                            HttpMethod.Post,
                            url
                        );

                    request.Content =
                        JsonContent.Create(data);


                    response =
                        await client.SendAsync(request);
                }


                string json =
                    await response.Content.ReadAsStringAsync();


                return new ContentResult
                {
                    Content = json,

                    ContentType =
                        "application/json",

                    StatusCode =
                        (int)response.StatusCode
                };
            }
            catch (Exception ex)
            {
                return StatusCode(
                    500,
                    new
                    {
                        success = false,
                        message = ex.Message
                    }
                );
            }
        }



        // ==================================================
        // DELETE MERCHANT
        // REAL API:
        // /api/ManageMerchant/DeleteMerchant?Id=1
        // ==================================================

        [HttpPost]
        public async Task<IActionResult> DeleteMerchant(int id)
        {
            try
            {
                string? token =
                    HttpContext.Session.GetString(
                        TokenSessionKey
                    );


                if (string.IsNullOrWhiteSpace(token))
                {
                    return Unauthorized(new
                    {
                        success = false,
                        message = "Please log in first."
                    });
                }


                if (id <= 0)
                {
                    return BadRequest(new
                    {
                        success = false,
                        message = "Invalid merchant ID."
                    });
                }


                using HttpClient client =
                    CreateHttpClient();


                string url =
                    ApiBaseUrl +
                    "/api/ManageMerchant/DeleteMerchant?Id=" +
                    id;


                /*
                 * REAL DELETE
                 */

                HttpResponseMessage response =
                    await client.DeleteAsync(url);


                /*
                 * Some APIs expose DELETE but accept POST.
                 * Fallback if necessary.
                 */

                if (
                    response.StatusCode ==
                    System.Net.HttpStatusCode.MethodNotAllowed
                )
                {
                    response =
                        await client.PostAsync(
                            url,
                            null
                        );
                }


                string json =
                    await response.Content.ReadAsStringAsync();


                return new ContentResult
                {
                    Content = json,

                    ContentType =
                        "application/json",

                    StatusCode =
                        (int)response.StatusCode
                };
            }
            catch (Exception ex)
            {
                return StatusCode(
                    500,
                    new
                    {
                        success = false,
                        message = ex.Message
                    }
                );
            }
        }

        [HttpGet]
        public Task<IActionResult> Outlets() =>
            PageOrJson(
                "/api/ManageOutlets/GetAllOutlets"
            );

        [HttpGet]
        public Task<IActionResult> FindOutletById(int id) =>
            Proxy(
                () =>
                {
                    if (id <= 0)
                    {
                        throw new ApiException(400, "Invalid outlet ID.");
                    }

                    return GetApiJson(
                        $"/api/ManageOutlets/FindOutletsById?id={id}"
                    );
                }
            );

        [HttpPost]
        public Task<IActionResult> CreateOutlet(
            [FromBody] JsonElement body) =>
            Proxy(
                () =>
                {
                    if (body.ValueKind != JsonValueKind.Object)
                    {
                        throw new ApiException(400, "Invalid outlet data.");
                    }

                    return PostOrPutApiJson(
                        "/api/ManageOutlets/CreateOutlets",
                        body
                    );
                }
            );

        [HttpPost]
        public Task<IActionResult> EditOutlet(
            [FromBody] JsonElement body) =>
            Proxy(
                () =>
                {
                    if (body.ValueKind != JsonValueKind.Object)
                    {
                        throw new ApiException(400, "Invalid outlet data.");
                    }

                    return PutOrPostApiJson(
                        "/api/ManageOutlets/EditOutlets",
                        body
                    );
                }
            );

        [HttpPost]
        public Task<IActionResult> DeleteOutlet(int id) =>
            Proxy(
                () =>
                {
                    if (id <= 0)
                    {
                        throw new ApiException(400, "Invalid outlet ID.");
                    }

                    return DeleteOrPostApiJson(
                        $"/api/ManageOutlets/DeleteOutlets?id={id}"
                    );
                }
            );


        [HttpGet]
        public Task<IActionResult> Staff(
            string? merchantId = null) =>
            PageOrJson(
                () =>
                    GetAllStaffJson(
                        merchantId
                    )
            );

        [HttpPost]
        public Task<IActionResult> CreateStaff(
            [FromBody] JsonElement body) =>
            Proxy(
                () =>
                {
                    if (body.ValueKind != JsonValueKind.Object)
                    {
                        throw new ApiException(400, "Invalid staff data.");
                    }

                    return PostOrPutApiJson(
                        "/api/ManageStaff/CreateStaff",
                        body
                    );
                }
            );

        [HttpPost]
        public Task<IActionResult> EditStaff(
            [FromBody] JsonElement body) =>
            Proxy(
                () =>
                {
                    if (body.ValueKind != JsonValueKind.Object)
                    {
                        throw new ApiException(400, "Invalid staff data.");
                    }

                    // The external API exposes CreateStaff as an upsert keyed by
                    // PhoneNumber. The Staff page keeps the original phone locked
                    // while editing so this updates the intended staff account.
                    return PostOrPutApiJson(
                        "/api/ManageStaff/CreateStaff",
                        body
                    );
                }
            );

        [HttpPost]
        public Task<IActionResult> DeleteStaff(
            [FromBody] JsonElement body) =>
            Proxy(
                () =>
                {
                    if (body.ValueKind != JsonValueKind.Object)
                    {
                        throw new ApiException(400, "Invalid staff data.");
                    }

                    return DeleteWithBodyOrPostApiJson(
                        "/api/ManageStaff/DeleteStaff",
                        body
                    );
                }
            );


        [HttpGet]
        public Task<IActionResult> Orders() =>
            PageOrJson(
                "/api/ManageDelivery/OrderHistoriesList"
            );


        [HttpGet]
        public Task<IActionResult> Rewards() =>
            PageOrJson(
                "/api/ManageRewards/GetAllRewards"
            );

        [HttpPost]
        public Task<IActionResult> CreateReward(
            [FromBody] JsonElement body) =>
            Proxy(
                () =>
                {
                    if (body.ValueKind != JsonValueKind.Object)
                    {
                        throw new ApiException(400, "Invalid reward data.");
                    }

                    return PostApiJson(
                        "/api/ManageRewards/CreateReward",
                        body
                    );
                }
            );

        [HttpPost]
        public Task<IActionResult> EditReward(
            [FromBody] JsonElement body) =>
            Proxy(
                () =>
                {
                    if (body.ValueKind != JsonValueKind.Object)
                    {
                        throw new ApiException(400, "Invalid reward data.");
                    }

                    bool isVoucher =
                        (
                            body.TryGetProperty(
                                "Type",
                                out JsonElement type
                            ) &&
                            string.Equals(
                                type.GetString(),
                                "Voucher",
                                StringComparison.OrdinalIgnoreCase
                            )
                        ) ||
                        (
                            body.TryGetProperty(
                                "RewardId",
                                out JsonElement rewardId
                            ) &&
                            rewardId.GetString()?.StartsWith(
                                "Voucher-",
                                StringComparison.OrdinalIgnoreCase
                            ) == true
                        );

                    return PostApiJson(
                        isVoucher
                            ? "/api/ManageRewards/EditVoucher"
                            : "/api/ManageRewards/EditReward",
                        body
                    );
                }
            );

        [HttpPost]
        public Task<IActionResult> DeleteReward(
            int id,
            string? type,
            [FromBody] JsonElement body) =>
            Proxy(
                async () =>
                {
                    if (id <= 0)
                    {
                        throw new ApiException(400, "Invalid reward ID.");
                    }

                    bool isVoucher =
                        string.Equals(
                            type,
                            "Voucher",
                            StringComparison.OrdinalIgnoreCase
                        );

                    bool isReward =
                        string.Equals(
                            type,
                            "Reward",
                            StringComparison.OrdinalIgnoreCase
                        );

                    if (!isVoucher && !isReward)
                    {
                        if (body.ValueKind != JsonValueKind.Object)
                        {
                            throw new ApiException(
                                400,
                                "Invalid reward record."
                            );
                        }

                        var repaired =
                            JsonSerializer.Deserialize<
                                Dictionary<string, object?>
                            >(
                                body.GetRawText()
                            ) ?? new Dictionary<string, object?>();

                        repaired["Id"] = id;
                        repaired["Type"] = "Reward";
                        repaired["RewardId"] =
                            "Reward-" + Guid.NewGuid();

                        await PostApiJson(
                            "/api/ManageRewards/EditReward",
                            repaired
                        );

                        isReward = true;
                    }

                    string action = isVoucher
                        ? "DeleteVoucher"
                        : "DeleteReward";

                    return await PostApiJson(
                        $"/api/ManageRewards/{action}?id={id}",
                        null
                    );
                }
            );


        [HttpGet]
        public Task<IActionResult> Vouchers() =>
            PageOrJson(
                "/api/ManageRewards/GetAllRewards"
            );

        [HttpPost]
        public Task<IActionResult> CreateVoucher(
            [FromBody] JsonElement body) =>
            Proxy(
                () =>
                {
                    if (body.ValueKind != JsonValueKind.Object)
                    {
                        throw new ApiException(400, "Invalid voucher data.");
                    }

                    return PostApiJson(
                        "/api/ManageRewards/CreateVoucher",
                        body
                    );
                }
            );

        [HttpPost]
        public Task<IActionResult> EditVoucher(
            [FromBody] JsonElement body) =>
            Proxy(
                () =>
                {
                    if (body.ValueKind != JsonValueKind.Object)
                    {
                        throw new ApiException(400, "Invalid voucher data.");
                    }

                    return PostApiJson(
                        "/api/ManageRewards/EditVoucher",
                        body
                    );
                }
            );

        [HttpPost]
        public Task<IActionResult> DeleteVoucher(int id) =>
            Proxy(
                () =>
                {
                    if (id <= 0)
                    {
                        throw new ApiException(400, "Invalid voucher ID.");
                    }

                    return PostApiJson(
                        $"/api/ManageRewards/DeleteVoucher?id={id}",
                        null
                    );
                }
            );


        [HttpGet]
        public Task<IActionResult> StampCampaigns() =>
            PageOrJson(
                "/api/ManageStamp/GetAllStamps"
            );

        [HttpPost]
        public Task<IActionResult> CreateStampCampaign(
            [FromBody] JsonElement body) =>
            Proxy(
                () =>
                {
                    if (body.ValueKind != JsonValueKind.Object)
                    {
                        throw new ApiException(400, "Invalid stamp campaign data.");
                    }

                    return PostApiJson(
                        "/api/ManageStamp/CreateStamp",
                        body
                    );
                }
            );

        [HttpPost]
        public Task<IActionResult> EditStampCampaign(
            [FromBody] JsonElement body) =>
            Proxy(
                () =>
                {
                    if (body.ValueKind != JsonValueKind.Object)
                    {
                        throw new ApiException(400, "Invalid stamp campaign data.");
                    }

                    return PostApiJson(
                        "/api/ManageStamp/EditStamp",
                        body
                    );
                }
            );

        [HttpPost]
        public Task<IActionResult> DeleteStampCampaign(int id) =>
            Proxy(
                () =>
                {
                    if (id <= 0)
                    {
                        throw new ApiException(400, "Invalid stamp campaign ID.");
                    }

                    return PostApiJson(
                        $"/api/ManageStamp/DeleteStamp?id={id}",
                        null
                    );
                }
            );


        [HttpGet]
        public Task<IActionResult> Banners() =>
            PageOrJson(
                "/api/ManageHighlight/GetAllHighlight"
            );

        [HttpPost]
        public Task<IActionResult> CreateBanner([FromBody] JsonElement body) =>
            Proxy(() =>
            {
                if (body.ValueKind != JsonValueKind.Object)
                {
                    throw new ApiException(400, "Invalid banner data.");
                }

                return PostApiJson("/api/ManageHighlight/CreateHighlight", body);
            });

        [HttpPost]
        public Task<IActionResult> EditBanner([FromBody] JsonElement body) =>
            Proxy(() =>
            {
                if (body.ValueKind != JsonValueKind.Object)
                {
                    throw new ApiException(400, "Invalid banner data.");
                }

                return PostApiJson("/api/ManageHighlight/EditHighlight", body);
            });

        [HttpPost]
        public Task<IActionResult> DeleteBanner(int id) =>
            Proxy(() =>
            {
                if (id <= 0)
                {
                    throw new ApiException(400, "Invalid banner ID.");
                }

                return PostApiJson($"/api/ManageHighlight/DeleteHighlight?id={id}", null);
            });


        [HttpGet]
        public Task<IActionResult> Feedback() =>
            PageOrJson(
                "/api/FeedBack/GetAllFeedbackList"
            );


        [HttpGet]
        public Task<IActionResult> AppVersions() =>
            PageOrJson(
                "/api/ManageVersion/GetAllVersion"
            );


        [HttpGet]
        public IActionResult Transactions() =>
            LoggedInView();

        [HttpGet]
        public Task<IActionResult> TransactionRecords(
            string type)
        {
            Func<Task<string>>? fetch =
                type?.Trim().ToLowerInvariant() switch
                {
                    "topups" => () => GetApiJson(
                        "/api/ManageTransaction/GetAllTopupRecords"),
                    "spends" => () => GetApiJson(
                        "/api/MerchantTransactionHistories/GetAllSpendRecords"),
                    "rewards" => () => GetApiJson(
                        "/api/ManageTransaction/GetAllRewardRecords"),
                    "vouchers" => () => GetApiJson(
                        "/api/ManageTransaction/GetAllVoucherRecords"),
                    "stamps" => () => GetApiJson(
                        "/api/MerchantTransactionHistories/GetAllStampRecords"),
                    "stampassigns" => () => GetApiJson(
                        "/api/MerchantTransactionHistories/GetAllStampAssignRecords"),
                    "stamptransactions" => () => GetApiJson(
                        "/api/MerchantTransactionHistories/GetAllStampTransactionRecords"),
                    "points" => () => PostApiJson(
                        "/api/ManagePoint/GetAllPointAssignRecord",
                        null),
                    _ => null
                };

            if (fetch == null)
            {
                return Task.FromResult<IActionResult>(
                    BadRequest(new
                    {
                        success = false,
                        message = "Unknown transaction type."
                    })
                );
            }

            return Proxy(fetch);
        }


        [HttpGet]
        public IActionResult Notifications() =>
            LoggedInView();

        [HttpPost]
        public Task<IActionResult> SendNotificationAll(
            [FromBody] JsonElement body) =>
            Proxy(
                () =>
                {
                    if (body.ValueKind != JsonValueKind.Object)
                    {
                        throw new ApiException(400, "Invalid notification data.");
                    }

                    string header = GetString(body, "NotificationHeader");
                    if (string.IsNullOrWhiteSpace(header)) header = GetString(body, "Title");
                    string notificationBody = GetString(body, "NotificationBody");
                    if (string.IsNullOrWhiteSpace(notificationBody)) notificationBody = GetString(body, "Body");
                    if (string.IsNullOrWhiteSpace(notificationBody)) notificationBody = GetString(body, "Message");

                    if (string.IsNullOrWhiteSpace(header) || string.IsNullOrWhiteSpace(notificationBody))
                    {
                        throw new ApiException(400, "Notification title and message are required.");
                    }

                    JsonElement payload = JsonSerializer.SerializeToElement(new
                    {
                        Type = string.IsNullOrWhiteSpace(GetString(body, "Type")) ? "General" : GetString(body, "Type"),
                        TargetId = string.IsNullOrWhiteSpace(GetString(body, "TargetId")) ? "All" : GetString(body, "TargetId"),
                        NotificationHeader = header,
                        NotificationBody = notificationBody
                    });

                    return PostOrPutApiJson(
                        "/api/MerchantCreateNotification/CreateNotificationAll",
                        payload
                    );
                }
            );

        [HttpPost]
        public Task<IActionResult> SendNotificationByDevice(
            [FromBody] JsonElement body) =>
            Proxy(
                () =>
                {
                    if (body.ValueKind != JsonValueKind.Object)
                    {
                        throw new ApiException(400, "Invalid notification data.");
                    }

                    string deviceId = GetString(body, "DeviceId");
                    if (string.IsNullOrWhiteSpace(deviceId)) deviceId = GetString(body, "TargetId");
                    string header = GetString(body, "NotificationHeader");
                    if (string.IsNullOrWhiteSpace(header)) header = GetString(body, "Title");
                    string notificationBody = GetString(body, "NotificationBody");
                    if (string.IsNullOrWhiteSpace(notificationBody)) notificationBody = GetString(body, "Body");
                    if (string.IsNullOrWhiteSpace(notificationBody)) notificationBody = GetString(body, "Message");

                    if (string.IsNullOrWhiteSpace(deviceId) || string.IsNullOrWhiteSpace(header) || string.IsNullOrWhiteSpace(notificationBody))
                    {
                        throw new ApiException(400, "Device ID, notification title, and message are required.");
                    }

                    JsonElement payload = JsonSerializer.SerializeToElement(new
                    {
                        DeviceId = deviceId,
                        PhoneNumber = GetString(body, "PhoneNumber"),
                        Type = string.IsNullOrWhiteSpace(GetString(body, "Type")) ? "General" : GetString(body, "Type"),
                        TargetId = string.IsNullOrWhiteSpace(GetString(body, "TargetId")) ? deviceId : GetString(body, "TargetId"),
                        NotificationHeader = header,
                        NotificationBody = notificationBody
                    });

                    return PostOrPutApiJson(
                        "/api/MerchantCreateNotification/CreateNotificationByDeviceId",
                        payload
                    );
                }
            );

        [HttpPost]
        public Task<IActionResult> SendMemberNotification(
            [FromBody] JsonElement body) =>
            Proxy(
                () =>
                {
                    if (body.ValueKind != JsonValueKind.Object)
                    {
                        throw new ApiException(400, "Invalid notification data.");
                    }

                    string title = GetString(body, "Title");
                    if (string.IsNullOrWhiteSpace(title)) title = GetString(body, "NotificationHeader");
                    string text = GetString(body, "Text");
                    if (string.IsNullOrWhiteSpace(text)) text = GetString(body, "Body");
                    if (string.IsNullOrWhiteSpace(text)) text = GetString(body, "Message");
                    if (string.IsNullOrWhiteSpace(text)) text = GetString(body, "NotificationBody");

                    if (string.IsNullOrWhiteSpace(title) || string.IsNullOrWhiteSpace(text))
                    {
                        throw new ApiException(400, "Notification title and message are required.");
                    }

                    JsonElement payload = JsonSerializer.SerializeToElement(new
                    {
                        Title = title,
                        Text = text
                    });

                    return PostOrPutApiJson(
                        "/api/MemberNotification/SendNotifications",
                        payload
                    );
                }
            );


        [HttpGet]
        public IActionResult DataImport() =>
            LoggedInView();


        // =========================================================
        // PAGE / JSON HELPERS
        // =========================================================

        private IActionResult LoggedInView()
        {
            if (!IsLoggedIn())
            {
                return RedirectToAction(
                    nameof(LoginPage)
                );
            }


            return View();
        }


        private Task<IActionResult> PageOrJson(
            string endpoint)
        {
            return PageOrJson(
                () =>
                    GetApiJson(
                        endpoint
                    )
            );
        }


        private async Task<IActionResult> PageOrJson(
            Func<Task<string>> fetch)
        {
            if (!IsLoggedIn())
            {
                return IsAjaxRequest()
                    ? Unauthorized(
                        new
                        {
                            success = false,
                            message =
                                "Session expired."
                        }
                    )
                    : RedirectToAction(
                        nameof(LoginPage)
                    );
            }


            if (!IsAjaxRequest())
            {
                return View();
            }


            try
            {
                string json =
                    await fetch();


                Response.Headers.CacheControl =
                    "no-store";


                return Content(
                    json,
                    "application/json"
                );
            }
            catch (ApiException ex)
            {
                if (
                    ex.StatusCode ==
                    401
                )
                {
                    HttpContext.Session.Clear();
                }


                return StatusCode(
                    ex.StatusCode == 401
                        ? 401
                        : 502,
                    new
                    {
                        success = false,
                        message =
                            ex.Message
                    }
                );
            }
            catch (Exception ex)
            {
                Console.WriteLine(
                    "[PAGE API ERROR] " +
                    ex.Message
                );


                return StatusCode(
                    500,
                    new
                    {
                        success = false,
                        message =
                            ex.Message
                    }
                );
            }
        }


        // =========================================================
        // PROXY
        // =========================================================

        private async Task<IActionResult> Proxy(
            Func<Task<string>> call)
        {
            if (!IsLoggedIn())
            {
                return Unauthorized(
                    new
                    {
                        success = false,
                        message =
                            "Session expired."
                    }
                );
            }


            try
            {
                string json =
                    await call();


                Response.Headers.CacheControl =
                    "no-store";


                return Content(
                    string.IsNullOrWhiteSpace(
                        json
                    )
                        ? "{\"success\":true}"
                        : json,
                    "application/json"
                );
            }
            catch (ApiException ex)
            {
                if (
                    ex.StatusCode ==
                    401
                )
                {
                    HttpContext.Session.Clear();
                }


                return StatusCode(
                    ex.StatusCode,
                    new
                    {
                        success = false,
                        message =
                            ex.Message
                    }
                );
            }
            catch (Exception ex)
            {
                Console.WriteLine(
                    "[PROXY API ERROR] " +
                    ex.Message
                );


                return StatusCode(
                    500,
                    new
                    {
                        success = false,
                        message =
                            ex.Message
                    }
                );
            }
        }


        private Task<IActionResult> ProxyPost(
            string endpoint,
            object? data)
        {
            return Proxy(
                () =>
                    PostApiJson(
                        endpoint,
                        data
                    )
            );
        }


        // =========================================================
        // AUTH
        // =========================================================

        private bool IsLoggedIn()
        {
            return
                !string.IsNullOrWhiteSpace(
                    HttpContext.Session.GetString(
                        TokenSessionKey
                    )
                );
        }


        private bool IsAjaxRequest()
        {
            return string.Equals(
                Request.Headers[
                    "X-Requested-With"
                ],
                "XMLHttpRequest",
                StringComparison.OrdinalIgnoreCase
            );
        }


        // =========================================================
        // HTTP CLIENT
        // =========================================================

        private HttpClient CreateHttpClient()
        {
            HttpClient client =
                _httpClientFactory.CreateClient("XCodeApi");


            string? token =
                HttpContext.Session.GetString(ApiTokenSessionKey)
                ?? HttpContext.Session.GetString(TokenSessionKey);


            if (
                !string.IsNullOrWhiteSpace(
                    token
                )
            )
            {
                client.DefaultRequestHeaders.Authorization =
                    new AuthenticationHeaderValue(
                        "Bearer",
                        token
                    );
            }


            client.DefaultRequestHeaders.Accept.Clear();


            client.DefaultRequestHeaders.Accept.Add(
                new MediaTypeWithQualityHeaderValue(
                    "application/json"
                )
            );


            return client;
        }


        private static string NormalizeApiBaseUrl(string value)
        {
            string baseUrl = value.Trim().TrimEnd('/');

            if (baseUrl.EndsWith("/api", StringComparison.OrdinalIgnoreCase))
            {
                baseUrl = baseUrl[..^4];
            }

            return baseUrl;
        }


        // =========================================================
        // SEND REQUEST
        // =========================================================

        private async Task<string> SendAsync(
            HttpMethod method,
            string endpoint,
            object? data)
        {
            HttpClient client =
                CreateHttpClient();


            using var request =
                new HttpRequestMessage(
                    method,
                    ApiBaseUrl +
                    endpoint
                );


            if (data != null)
            {
                request.Content =
                    new StringContent(
                        JsonSerializer.Serialize(
                            data
                        ),
                        Encoding.UTF8,
                        "application/json"
                    );
            }


            HttpResponseMessage response =
                await client.SendAsync(
                    request
                );


            string body =
                await response.Content
                    .ReadAsStringAsync();


            Console.WriteLine(
                $"[API] {method} {endpoint} -> {(int)response.StatusCode}"
            );


            if (
                !response.IsSuccessStatusCode
            )
            {
                throw new ApiException(
                    (int)response.StatusCode,
                    string.IsNullOrWhiteSpace(
                        body
                    )
                        ? $"{(int)response.StatusCode} {response.StatusCode}"
                        : body
                );
            }


            return body;
        }


        private Task<string> GetApiJson(
            string endpoint)
        {
            return SendAsync(
                HttpMethod.Get,
                endpoint,
                null
            );
        }


        private Task<string> PostApiJson(
            string endpoint,
            object? data)
        {
            return SendAsync(
                HttpMethod.Post,
                endpoint,
                data
            );
        }


        private Task<string> PutApiJson(
            string endpoint,
            object? data)
        {
            return SendAsync(
                HttpMethod.Put,
                endpoint,
                data
            );
        }


        private async Task<string> PostOrPutApiJson(
            string endpoint,
            object? data)
        {
            try
            {
                return await PostApiJson(endpoint, data);
            }
            catch (ApiException ex)
                when (ex.StatusCode == 405)
            {
                return await PutApiJson(endpoint, data);
            }
        }


        private async Task<string> PutOrPostApiJson(
            string endpoint,
            object? data)
        {
            try
            {
                return await PutApiJson(endpoint, data);
            }
            catch (ApiException ex)
                when (ex.StatusCode == 405)
            {
                return await PostApiJson(endpoint, data);
            }
        }


        private async Task<string> DeleteOrPostApiJson(
            string endpoint)
        {
            try
            {
                return await SendAsync(
                    HttpMethod.Delete,
                    endpoint,
                    null
                );
            }
            catch (ApiException ex)
                when (ex.StatusCode == 405)
            {
                return await PostApiJson(endpoint, null);
            }
        }


        private async Task<string> DeleteWithBodyOrPostApiJson(
            string endpoint,
            object data)
        {
            try
            {
                return await SendAsync(
                    HttpMethod.Delete,
                    endpoint,
                    data
                );
            }
            catch (ApiException ex)
                when (ex.StatusCode == 405)
            {
                return await PostApiJson(endpoint, data);
            }
        }


        // =========================================================
        // STAFF
        // =========================================================

        private async Task<string> GetAllStaffJson(
            string? merchantId = null,
            Task<string>? preloadedMerchants = null)
        {
            const string staffEndpoint =
                "/api/ManageStaff/GetAllStaff";


            if (
                !string.IsNullOrWhiteSpace(
                    merchantId
                )
            )
            {
                return await PostApiJson(
                    staffEndpoint,
                    new
                    {
                        MerchantId =
                            merchantId
                    }
                );
            }


            string merchantsJson =
                await (
                    preloadedMerchants ??
                    GetApiJson(
                        "/api/ManageMerchant/GetAllMerchant"
                    )
                );


            List<string> ids =
                ExtractMerchantIds(
                    merchantsJson
                );


            var gate =
                new SemaphoreSlim(5);


            var tasks =
                ids.Select(
                    async id =>
                    {
                        await gate.WaitAsync();


                        try
                        {
                            string json =
                                await PostApiJson(
                                    staffEndpoint,
                                    new
                                    {
                                        MerchantId =
                                            id
                                    }
                                );


                            return (
                                Id: id,
                                Json: json
                            );
                        }
                        catch (
                            ApiException ex
                        )
                            when (
                                ex.StatusCode ==
                                401
                            )
                        {
                            throw;
                        }
                        catch (
                            Exception ex
                        )
                        {
                            Console.WriteLine(
                                $"[STAFF] merchant {id} failed: {ex.Message}"
                            );


                            return (
                                Id: id,
                                Json: ""
                            );
                        }
                        finally
                        {
                            gate.Release();
                        }
                    }
                );


            var results =
                await Task.WhenAll(
                    tasks
                );


            using var stream =
                new MemoryStream();


            using (
                var writer =
                    new Utf8JsonWriter(
                        stream
                    )
            )
            {
                writer.WriteStartArray();


                foreach (
                    var result in results
                )
                {
                    if (
                        string.IsNullOrWhiteSpace(
                            result.Json
                        )
                    )
                    {
                        continue;
                    }


                    using JsonDocument doc =
                        JsonDocument.Parse(
                            result.Json
                        );


                    JsonElement list =
                        FindArray(
                            doc.RootElement,
                            0
                        );


                    if (
                        list.ValueKind !=
                        JsonValueKind.Array
                    )
                    {
                        continue;
                    }


                    foreach (
                        JsonElement item
                        in list.EnumerateArray()
                    )
                    {
                        if (
                            item.ValueKind !=
                            JsonValueKind.Object
                        )
                        {
                            item.WriteTo(
                                writer
                            );

                            continue;
                        }


                        writer.WriteStartObject();


                        bool hasMerchantId =
                            false;


                        foreach (
                            JsonProperty property
                            in item.EnumerateObject()
                        )
                        {
                            if (
                                string.Equals(
                                    property.Name,
                                    "merchantId",
                                    StringComparison.OrdinalIgnoreCase
                                )
                            )
                            {
                                hasMerchantId =
                                    true;
                            }


                            property.WriteTo(
                                writer
                            );
                        }


                        if (!hasMerchantId)
                        {
                            writer.WriteString(
                                "merchantId",
                                result.Id
                            );
                        }


                        writer.WriteEndObject();
                    }
                }


                writer.WriteEndArray();
            }


            return Encoding.UTF8.GetString(
                stream.ToArray()
            );
        }


        private static readonly string[]
            MerchantIdNames =
            {
                "merchantId",
                "id",
                "merchantID",
                "merchant_id"
            };


        private static List<string>
            ExtractMerchantIds(
                string merchantsJson)
        {
            var ids =
                new List<string>();


            if (
                string.IsNullOrWhiteSpace(
                    merchantsJson
                )
            )
            {
                return ids;
            }


            using JsonDocument doc =
                JsonDocument.Parse(
                    merchantsJson
                );


            JsonElement list =
                FindArray(
                    doc.RootElement,
                    0
                );


            if (
                list.ValueKind !=
                JsonValueKind.Array
            )
            {
                return ids;
            }


            foreach (
                JsonElement item
                in list.EnumerateArray()
            )
            {
                if (
                    item.ValueKind !=
                    JsonValueKind.Object
                )
                {
                    continue;
                }


                foreach (
                    string name
                    in MerchantIdNames
                )
                {
                    if (
                        !TryGetPropertyIgnoreCase(
                            item,
                            name,
                            out JsonElement value
                        )
                    )
                    {
                        continue;
                    }


                    string? text =
                        value.ValueKind switch
                        {
                            JsonValueKind.String =>
                                value.GetString(),

                            JsonValueKind.Number =>
                                value.ToString(),

                            _ =>
                                null
                        };


                    if (
                        !string.IsNullOrWhiteSpace(
                            text
                        )
                    )
                    {
                        ids.Add(
                            text
                        );

                        break;
                    }
                }
            }


            return ids
                .Distinct()
                .ToList();
        }


        // =========================================================
        // JSON HELPERS
        // =========================================================

        private static bool
            TryGetPropertyIgnoreCase(
                JsonElement obj,
                string name,
                out JsonElement value)
        {
            if (
                obj.ValueKind ==
                JsonValueKind.Object
            )
            {
                foreach (
                    JsonProperty property
                    in obj.EnumerateObject()
                )
                {
                    if (
                        string.Equals(
                            property.Name,
                            name,
                            StringComparison.OrdinalIgnoreCase
                        )
                    )
                    {
                        value =
                            property.Value;

                        return true;
                    }
                }
            }


            value =
                default;


            return false;
        }


        private static string GetString(
            JsonElement obj,
            string name)
        {
            if (
                TryGetPropertyIgnoreCase(
                    obj,
                    name,
                    out JsonElement value
                )
            )
            {
                if (
                    value.ValueKind ==
                    JsonValueKind.String
                )
                {
                    return
                        value.GetString() ??
                        "";
                }


                if (
                    value.ValueKind !=
                    JsonValueKind.Null &&
                    value.ValueKind !=
                    JsonValueKind.Undefined
                )
                {
                    return
                        value.ToString();
                }
            }


            return "";
        }


        private static int GetInt(
            JsonElement obj,
            string name)
        {
            if (
                TryGetPropertyIgnoreCase(
                    obj,
                    name,
                    out JsonElement value
                )
            )
            {
                if (
                    value.ValueKind ==
                    JsonValueKind.Number &&
                    value.TryGetInt32(
                        out int number
                    )
                )
                {
                    return number;
                }


                if (
                    value.ValueKind ==
                    JsonValueKind.String &&
                    int.TryParse(
                        value.GetString(),
                        out int textNumber
                    )
                )
                {
                    return textNumber;
                }
            }


            return 0;
        }


        private static readonly string[]
            ArrayNames =
            {
                "data",
                "result",
                "results",
                "items",
                "list",
                "records",
                "rows"
            };


        private static JsonElement FindArray(
            JsonElement element,
            int depth)
        {
            if (
                element.ValueKind ==
                JsonValueKind.Array
            )
            {
                return element;
            }


            if (
                element.ValueKind !=
                JsonValueKind.Object ||
                depth > 2
            )
            {
                return default;
            }


            foreach (
                JsonProperty property
                in element.EnumerateObject()
            )
            {
                if (
                    ArrayNames.Contains(
                        property.Name,
                        StringComparer.OrdinalIgnoreCase
                    )
                )
                {
                    JsonElement found =
                        FindArray(
                            property.Value,
                            depth + 1
                        );


                    if (
                        found.ValueKind ==
                        JsonValueKind.Array
                    )
                    {
                        return found;
                    }
                }
            }


            return default;
        }


        // =========================================================
        // COUNT
        // =========================================================

        private static readonly string[]
            CountNames =
            {
                "count",
                "total",
                "totalCount"
            };


        private static int CountJsonArray(
            string json)
        {
            if (
                string.IsNullOrWhiteSpace(
                    json
                )
            )
            {
                return 0;
            }


            try
            {
                using JsonDocument document =
                    JsonDocument.Parse(
                        json
                    );


                return CountElement(
                    document.RootElement,
                    0
                );
            }
            catch
            {
                return 0;
            }
        }


        private static int CountElement(
            JsonElement element,
            int depth)
        {
            if (
                element.ValueKind ==
                JsonValueKind.Array
            )
            {
                return element.GetArrayLength();
            }


            if (
                element.ValueKind !=
                JsonValueKind.Object ||
                depth > 2
            )
            {
                return 0;
            }


            foreach (
                JsonProperty property
                in element.EnumerateObject()
            )
            {
                if (
                    ArrayNames.Contains(
                        property.Name,
                        StringComparer.OrdinalIgnoreCase
                    )
                )
                {
                    int number =
                        CountElement(
                            property.Value,
                            depth + 1
                        );


                    if (
                        property.Value.ValueKind ==
                        JsonValueKind.Array ||
                        number > 0
                    )
                    {
                        return number;
                    }
                }
            }


            foreach (
                JsonProperty property
                in element.EnumerateObject()
            )
            {
                if (
                    CountNames.Contains(
                        property.Name,
                        StringComparer.OrdinalIgnoreCase
                    ) &&
                    property.Value.ValueKind ==
                    JsonValueKind.Number &&
                    property.Value.TryGetInt32(
                        out int count
                    )
                )
                {
                    return count;
                }
            }


            return 0;
        }


        // =========================================================
        // TOKEN
        // =========================================================

        private static readonly string[]
            TokenNames =
            {
                "successToken",
                "token",
                "access_token",
                "accessToken",
                "jwt"
            };


        private static string ExtractToken(
            string responseBody)
        {
            if (
                string.IsNullOrWhiteSpace(
                    responseBody
                )
            )
            {
                return "";
            }


            string trimmed =
                responseBody.Trim();


            if (
                !trimmed.StartsWith("{")
            )
            {
                return trimmed.Trim('"');
            }


            try
            {
                using JsonDocument document =
                    JsonDocument.Parse(
                        responseBody
                    );


                return FindToken(
                    document.RootElement,
                    0
                );
            }
            catch
            {
                return "";
            }
        }


        private static string FindToken(
            JsonElement element,
            int depth)
        {
            if (
                element.ValueKind !=
                JsonValueKind.Object ||
                depth > 2
            )
            {
                return "";
            }


            foreach (
                JsonProperty property
                in element.EnumerateObject()
            )
            {
                if (
                    TokenNames.Contains(
                        property.Name,
                        StringComparer.OrdinalIgnoreCase
                    ) &&
                    property.Value.ValueKind ==
                    JsonValueKind.String
                )
                {
                    return
                        property.Value.GetString() ??
                        "";
                }
            }


            foreach (
                JsonProperty property
                in element.EnumerateObject()
            )
            {
                if (
                    property.Value.ValueKind ==
                    JsonValueKind.Object
                )
                {
                    string nested =
                        FindToken(
                            property.Value,
                            depth + 1
                        );


                    if (
                        !string.IsNullOrEmpty(
                            nested
                        )
                    )
                    {
                        return nested;
                    }
                }
            }


            return "";
        }


        // =========================================================
        // API EXCEPTION
        // =========================================================

        private class ApiException :
            Exception
        {
            public int StatusCode
            {
                get;
            }


            public ApiException(
                int statusCode,
                string message)
                : base(message)
            {
                StatusCode =
                    statusCode;
            }
        }
    }
}
