import os

file_path = r'd:\chenna-trading-system-dashboard\src\components\TimeTravelBacktestModal.tsx'

with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Find start line
start_idx = -1
for i, line in enumerate(lines):
    if '    // Dynamic Strategy Rules Helper' in line:
        start_idx = i
        break

if start_idx == -1:
    print("Could not find start line")
    exit(1)

# Find end line (looking for ); before Date Range)
end_idx = -1
for i in range(start_idx, len(lines)):
    if '                        );' in line: # This is ambiguous, let's look for the one before Date Range
        pass
    
    if '                        );' in lines[i] and i+2 < len(lines) and '{/* Date Range */}' in lines[i+2]:
        end_idx = i
        break

if end_idx == -1:
    # Try slightly looser match
    for i in range(start_idx, len(lines)):
        if ');' in lines[i] and 'Date Range' in lines[i+2]:
             end_idx = i
             break

if end_idx == -1:
    print("Could not find end line")
    exit(1)

print(f"Replacing lines {start_idx+1} to {end_idx+1}")

new_content = [
    "                        {/* Dynamic Strategy Rules (Result of getStrategyRules) */}\n",
    "                        <div className={`bg-${activeRules.color}-900/20 border border-${activeRules.color}-500/40 rounded-lg p-4`}>\n",
    "                            <h3 className={`text-sm font-semibold text-${activeRules.color}-400 mb-3`}>\n",
    "                                {activeRules.title}\n",
    "                            </h3>\n",
    "                            <div className=\"text-xs text-slate-300 space-y-2\">\n",
    "                                {activeRules.rules.map((rule, idx) => (\n",
    "                                    <div key={idx} className=\"flex items-center gap-2\">\n",
    "                                        <span className=\"text-lg\">{rule.icon}</span>\n",
    "                                        <span>{rule.text}</span>\n",
    "                                    </div>\n",
    "                                ))}\n",
    "                            </div>\n",
    "                        </div>\n"
]

# Keep lines before start_idx
# Skip lines from start_idx to end_idx (inclusive)
# Keep lines after end_idx

final_lines = lines[:start_idx] + new_content + lines[end_idx+1:]

with open(file_path, 'w', encoding='utf-8') as f:
    f.writelines(final_lines)

print("Successfully patched file")
