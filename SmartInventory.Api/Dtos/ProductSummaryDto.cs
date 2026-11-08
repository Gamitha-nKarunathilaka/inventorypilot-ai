namespace SmartInventory.Api.Dtos;

public record ProductSummaryDto(
    int Id,
    string Name,
    string Sku,
    string Category,
    decimal Price,
    int Quantity,
    int ReorderLevel
);