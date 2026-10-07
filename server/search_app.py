import os

search_dir = "C:/projects/RewardsPlanner/reward-planner-mobileapp/src"
search_str = "RNHTMLtoPDF"

for root, dirs, files in os.walk(search_dir):
    if "node_modules" in dirs:
        dirs.remove("node_modulers" \
        "s")
    for file in files:
        filepath = os.path.join(root, file)
        try:
            with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()
                if search_str in content:
                    print(f"Found in {filepath}")
        except Exception as e:
            pass
