using System.ComponentModel.DataAnnotations;

namespace AdminGroupAssignment.Models;

public sealed class UpdateVersionRequest
{
    [Required, StringLength(100)] public string AndroidBuildNumber { get; set; } = "";
    [Range(0, int.MaxValue)] public int AndroidVersionCode { get; set; }
    [Required, StringLength(100)] public string IOSBuildNumber { get; set; } = "";
    [Range(0, int.MaxValue)] public int IOSVersionCode { get; set; }
    [Required, StringLength(1000)] public string Setting { get; set; } = "";
}
