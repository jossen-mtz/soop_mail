import sys

def check_indentation(filename):
    with open(filename, 'r') as f:
        lines = f.readlines()
    
    for i, line in enumerate(lines):
        stripped = line.lstrip()
        if not stripped: continue
        indent = len(line) - len(stripped)
        # Check if indent is multiple of 4
        if indent % 4 != 0:
            print(f"Line {i+1}: Indent {indent} is not multiple of 4: {line.strip()}")

if __name__ == "__main__":
    check_indentation(sys.argv[1])
