namespace AdminGroupAssignment.Models
{
    public class MemberCrudRequest
    {
        public int Id { get; set; }

        public string? UserId { get; set; }

        public string? Name { get; set; }

        public string? Email { get; set; }

        public string? PhoneNumber { get; set; }

        public string? BirthDate { get; set; }

        public string? ReferralCode { get; set; }

        public string? ReferralBy { get; set; }

        public string? Password { get; set; }

        public string? Tier { get; set; }

        public string? Image { get; set; }

        public string? ImageByte { get; set; }

        public string? FirstLogin { get; set; }

        public string? EmailSubcribe { get; set; }

        public string? NotificationStatus { get; set; }

        public string? AccountStatus { get; set; }

        public string? RegisterTime { get; set; }

        public string? DeviceId { get; set; }
    }
}