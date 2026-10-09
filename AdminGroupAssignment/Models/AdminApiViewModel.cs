namespace AdminGroupAssignment.Models
{
    public class AdminApiViewModel
    {
        public string PageTitle { get; set; } = "";

        public string ApiEndpoint { get; set; } = "";

        public string? SearchValue { get; set; }

        public int CurrentPage { get; set; } = 1;

        public int PageSize { get; set; } = 10;
    }
}