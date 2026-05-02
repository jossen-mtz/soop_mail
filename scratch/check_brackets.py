
def check_balance(filename):
    with open(filename, 'r', encoding='utf-8') as f:
        content = f.read()
    
    stack = []
    pairs = {')': '(', '}': '{', ']': '['}
    line = 1
    col = 1
    
    for char in content:
        if char == '\n':
            line += 1
            col = 1
        else:
            col += 1
            
        if char in '({[':
            stack.append((char, line, col))
        elif char in ')}]':
            if not stack:
                print(f"Extra {char} at line {line}, col {col}")
                return
            top_char, top_line, top_col = stack.pop()
            if top_char != pairs[char]:
                print(f"Mismatch: {top_char} at {top_line}:{top_col} closed by {char} at {line}:{col}")
                return
    
    if stack:
        for char, line, col in stack:
            print(f"Unclosed {char} at line {line}, col {col}")
    else:
        print("All balanced!")

check_balance(r'c:\Users\Travis\Desktop\soop_mail\frontend\src\pages\Dashboard.tsx')
