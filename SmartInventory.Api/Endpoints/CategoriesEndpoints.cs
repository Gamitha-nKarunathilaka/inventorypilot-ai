using Microsoft.EntityFrameworkCore;
using SmartInventory.Api.Data;
using SmartInventory.Api.Dtos;
using SmartInventory.Api.Models;

namespace SmartInventory.Api.Endpoints;

public static class CategoriesEndpoints
{
    public static void MapCategoriesEndpoints(this WebApplication app)
    {
        // GET /categories
        app.MapGet("/categories", async (InventoryContext dbContext) =>
        {
            var categories = await dbContext.Categories
                .OrderBy(category => category.Name)
                .Select(category => new CategoryDto(
                    category.Id,
                    category.Name
                ))
                .ToListAsync();

            return Results.Ok(categories);
        });

        // GET /categories/{id}
        app.MapGet("/categories/{id:int}", async (
            int id,
            InventoryContext dbContext) =>
        {
            var category = await dbContext.Categories.FindAsync(id);

            if (category is null)
            {
                return Results.NotFound();
            }

            return Results.Ok(
                new CategoryDto(category.Id, category.Name)
            );
        })
        .WithName("GetCategory");

        // POST /categories
        app.MapPost("/categories", async (
            CreateCategoryDto newCategory,
            InventoryContext dbContext) =>
        {
            if (string.IsNullOrWhiteSpace(newCategory.Name))
            {
                return Results.BadRequest("Category name is required.");
            }

            Category category = new()
            {
                Name = newCategory.Name.Trim()
            };

            dbContext.Categories.Add(category);

            await dbContext.SaveChangesAsync();

            CategoryDto response = new(
                category.Id,
                category.Name
            );

            return Results.CreatedAtRoute(
                "GetCategory",
                new { id = category.Id },
                response
            );
        });
    }
}