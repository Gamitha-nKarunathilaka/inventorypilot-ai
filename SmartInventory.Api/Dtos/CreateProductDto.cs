using System.ComponentModel.DataAnnotations;

namespace SmartInventory.Api.Dtos;

public record CreateProductDto(
    [Required][StringLength(100)] string Name,
    [Required][StringLength(50)] string Sku,
    [Range(1, int.MaxValue)] int CategoryId,
    [Range(typeof(decimal), "0", "999999999.99")] decimal Price,
    [Range(0, int.MaxValue)] int Quantity,
    [Range(0, int.MaxValue)] int ReorderLevel
);