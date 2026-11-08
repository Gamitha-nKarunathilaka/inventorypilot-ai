using Microsoft.EntityFrameworkCore;
using SmartInventory.Api.Data;
using SmartInventory.Api.Endpoints;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<InventoryContext>(options =>
    options.UseSqlite(
        builder.Configuration.GetConnectionString("Inventory")
    )
);

var app = builder.Build();

app.MapGet("/", () => "Smart Inventory API is running!");
app.MapCategoriesEndpoints();
app.MapProductsEndpoints();

app.Run();