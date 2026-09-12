with open("tmp_app.js", "r") as f:
    lines = f.readlines()

# find index of "// ─── § 17"
start_idx = 0
for i, line in enumerate(lines):
    if "// ─── § 17" in line:
        start_idx = i
        break

core_lines = lines[start_idx:]

with open("js/core.js", "w") as f:
    f.writelines(core_lines)
    
    f.write("\n// Helper for drag and drop\n")
    f.write("function addItemBackToBank(dragItemsBox, itemText, draggables) {\n")
    f.write("    const newItem = document.createElement('div');\n")
    f.write("    newItem.className = 'drag-item';\n")
    f.write("    newItem.draggable = true;\n")
    f.write("    newItem.textContent = itemText;\n")
    f.write("    newItem.dataset.itemText = itemText;\n")
    f.write("    newItem.addEventListener('dragstart', (e) => {\n")
    f.write("        e.dataTransfer.setData('application/x-drag-item', itemText);\n")
    f.write("        e.dataTransfer.setData('text/plain', itemText);\n")
    f.write("        e.dataTransfer.setData('application/x-source-zone', '');\n")
    f.write("    });\n")
    f.write("    dragItemsBox.appendChild(newItem);\n")
    f.write("}\n")
