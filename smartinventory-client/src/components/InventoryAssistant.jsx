import GeminiLivePanel from "./GeminiLivePanel.jsx";

export default function InventoryAssistant({
  onInventoryChanged,
  isCreatePage = false,
  showHead = false,
}) {
  return (
    <GeminiLivePanel
      showHead={showHead}
      onInventoryChanged={onInventoryChanged}
      intro={
        isCreatePage
          ? "Start a call to ask about categories, stock or product details while you fill in the form."
          : "Start a call to check or update inventory. Refer to a product by name or SKU."
      }
    />
  );
}
