namespace SmartInventory.Api.Models;

public class Product
{
    public int Id { get; set; }

    public required string Name { get; set; }

    public required string Sku { get; set; }

    public int CategoryId { get; set; }

    public Category? Category { get; set; }

    public decimal Price { get; set; }

    public int Quantity { get; set; }

    public int ReorderLevel { get; set; }
}