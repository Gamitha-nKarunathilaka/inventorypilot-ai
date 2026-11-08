namespace SmartInventory.Api.Dtos;

public record ProductDetailsDto(
    int Id,
    string Name,
    string Sku,
    int CategoryId,
    decimal Price,
    int Quantity,
    int ReorderLevel
);