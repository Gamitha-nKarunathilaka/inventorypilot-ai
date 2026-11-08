using Microsoft.EntityFrameworkCore;
using SmartInventory.Api.Data;
using SmartInventory.Api.Dtos;
using SmartInventory.Api.Models;
using Microsoft.Data.Sqlite;

namespace SmartInventory.Api.Endpoints;

public static class ProductsEndpoints
{
    public static void MapProductsEndpoints(this WebApplication app)
    {
        // GET /products
        app.MapGet("/products", async (InventoryContext dbContext) =>
        {
            var products = await dbContext.Products
                .OrderBy(product => product.Name)
                .Select(product => new ProductSummaryDto(
                    product.Id,
                    product.Name,
                    product.Sku,
                    product.Category!.Name,
                    product.Price,
                    product.Quantity,
                    product.ReorderLevel
                ))
                .ToListAsync();

            return Results.Ok(products);
        });
        // GET /products/{id}
        app.MapGet("/products/{id:int}", async (
            int id,
            InventoryContext dbContext) =>
        {
            var product = await dbContext.Products.FindAsync(id);

            if (product is null)
            {
                return Results.NotFound();
            }

            ProductDetailsDto response = new(
                product.Id,
                product.Name,
                product.Sku,
                product.CategoryId,
                product.Price,
                product.Quantity,
                product.ReorderLevel
            );

            return Results.Ok(response);
        })
        .WithName("GetProduct");

        // POST /products
        app.MapPost("/products", async (
            CreateProductDto newProduct,
            InventoryContext dbContext) =>
        {
            if (string.IsNullOrWhiteSpace(newProduct.Name) ||
                string.IsNullOrWhiteSpace(newProduct.Sku))
            {
                return Results.BadRequest("Name and SKU are required.");
            }

            string name = newProduct.Name.Trim();
            string sku = newProduct.Sku.Trim();

            if (name.Length > 100 || sku.Length > 50)
            {
                return Results.BadRequest(
                    "Name must be at most 100 characters and SKU at most 50."
                );
            }

            if (newProduct.Price < 0 ||
                newProduct.Price > 999999999.99m ||
                newProduct.Quantity < 0 ||
                newProduct.ReorderLevel < 0)
            {
                return Results.BadRequest(
                    "Price must be between 0 and 999999999.99. " +
                    "Quantity and ReorderLevel cannot be negative."
                );
            }

            bool categoryExists = await dbContext.Categories
                .AnyAsync(c => c.Id == newProduct.CategoryId);

            if (!categoryExists)
            {
                return Results.BadRequest("Category does not exist.");
            }

            bool skuExists = await dbContext.Products
                .AnyAsync(p => p.Sku == sku);

            if (skuExists)
            {
                return Results.Conflict("This SKU already exists.");
            }

            Product product = new()
            {
                Name = name,
                Sku = sku,
                CategoryId = newProduct.CategoryId,
                Price = newProduct.Price,
                Quantity = newProduct.Quantity,
                ReorderLevel = newProduct.ReorderLevel
            };

            dbContext.Products.Add(product);

            try
            {
                await dbContext.SaveChangesAsync();
            }
            catch (DbUpdateException ex)
                  when (ex.InnerException is SqliteException sqliteException &&
                       sqliteException.SqliteExtendedErrorCode == 2067)
            {
                return Results.Conflict("This SKU already exists.");
            }

            ProductDetailsDto response = new(
                product.Id,
                product.Name,
                product.Sku,
                product.CategoryId,
                product.Price,
                product.Quantity,
                product.ReorderLevel
            );

            return Results.CreatedAtRoute(
                "GetProduct",
                new { id = product.Id },
                response
            );
        });

        // PUT /products/{id}
        app.MapPut("/products/{id:int}", async (
            int id,
            UpdateProductDto updatedProduct,
            InventoryContext dbContext) =>
        {
            var product = await dbContext.Products.FindAsync(id);

            if (product is null)
            {
                return Results.NotFound();
            }

            if (string.IsNullOrWhiteSpace(updatedProduct.Name) ||
                string.IsNullOrWhiteSpace(updatedProduct.Sku))
            {
                return Results.BadRequest("Name and SKU are required.");
            }

            string name = updatedProduct.Name.Trim();
            string sku = updatedProduct.Sku.Trim();

            if (name.Length > 100 || sku.Length > 50)
            {
                return Results.BadRequest(
                    "Name must be at most 100 characters and SKU at most 50."
                );
            }

            if (updatedProduct.Price < 0 ||
                updatedProduct.Price > 999999999.99m ||
                updatedProduct.Quantity < 0 ||
                updatedProduct.ReorderLevel < 0)
            {
                return Results.BadRequest(
                    "Price must be between 0 and 999999999.99. " +
                    "Quantity and ReorderLevel cannot be negative."
                );
            }

            bool categoryExists = await dbContext.Categories
                .AnyAsync(c => c.Id == updatedProduct.CategoryId);

            if (!categoryExists)
            {
                return Results.BadRequest("Category does not exist.");
            }

            bool skuExists = await dbContext.Products
                .AnyAsync(p => p.Sku == sku && p.Id != id);

            if (skuExists)
            {
                return Results.Conflict("This SKU already exists.");
            }

            product.Name = name;
            product.Sku = sku;
            product.CategoryId = updatedProduct.CategoryId;
            product.Price = updatedProduct.Price;
            product.Quantity = updatedProduct.Quantity;
            product.ReorderLevel = updatedProduct.ReorderLevel;

            try
            {
                await dbContext.SaveChangesAsync();
            }
            catch (DbUpdateException ex)
                when (ex.InnerException is SqliteException sqliteException &&
                      sqliteException.SqliteExtendedErrorCode == 2067)
            {
                return Results.Conflict("This SKU already exists.");
            }

            return Results.NoContent();
        });

        // DELETE /products/{id}
app.MapDelete("/products/{id:int}", async (
    int id,
    InventoryContext dbContext) =>
{
    var product = await dbContext.Products.FindAsync(id);

    if (product is null)
    {
        return Results.NotFound();
    }

    dbContext.Products.Remove(product);

    await dbContext.SaveChangesAsync();

    return Results.NoContent();
});
    }
}