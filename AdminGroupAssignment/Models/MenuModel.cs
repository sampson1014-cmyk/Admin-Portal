namespace AdminGroupAssignment.Models
{
    // Matches swagger "MenuViewModel" (CreateMenuItem / EditMenu)
    public class MenuItemRequest
    {
        public string? MenuId { get; set; }
        public string? Image { get; set; }
        public string? ImageByte { get; set; }
        public string? ItemName { get; set; }
        public string? ItemDescription { get; set; }
        public double Price { get; set; }
        public int Qty { get; set; }
        public bool IsDeliveryAllow { get; set; }
        public bool IsSpicy { get; set; }
        public string? Status { get; set; }
        public string? Category { get; set; }
        public string? SubMenuListJson { get; set; }
    }

    // Matches swagger "MenuSubList" (EditSubMenuItem)
    public class MenuSubItemRequest
    {
        public int Id { get; set; }
        public string? SubMenuId { get; set; }
        public string? SubMenuItemName { get; set; }
        public string? Description { get; set; }
        public double AddOnFoodPrice { get; set; }
        public string? Category { get; set; }
        public string? MenuId { get; set; }
    }

    // Used for DeleteMenu (swagger "FindMenuParam" - field name assumed to be MenuId)
    public class MenuIdRequest
    {
        public string? MenuId { get; set; }
    }
}