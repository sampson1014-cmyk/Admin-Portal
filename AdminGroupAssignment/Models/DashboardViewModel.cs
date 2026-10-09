namespace AdminGroupAssignment.Models
{
    // Property names must match the keys used in AdminController.DashboardData
    public class DashboardViewModel
    {
        // People
        public int Members { get; set; }
        public int Merchants { get; set; }
        public int Outlets { get; set; }
        public int Staff { get; set; }

        // Content and activity
        public int Orders { get; set; }
        public int MenuItems { get; set; }
        public int Feedback { get; set; }
        public int Rewards { get; set; }
        public int StampCampaigns { get; set; }
        public int Banners { get; set; }

        // Transactions
        public int TopUps { get; set; }
        public int Spends { get; set; }
        public int RewardRedemptions { get; set; }
        public int Vouchers { get; set; }          // voucher records
        public int StampRecords { get; set; }
        public int PointAssigns { get; set; }

        // System
        public int AppVersions { get; set; }

        public bool ApiConnected { get; set; }
        public string LastUpdated { get; set; } = "";

        // Modules that failed to load (shown on the dashboard)
        public List<string> Errors { get; set; } = new();
    }
}