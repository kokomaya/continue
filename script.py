import os
import sys

def create_file(filename, content):
    # Create a new file with the given filename and content
    with open(filename, 'w') as f:
        f.write(content)

if __name__ == "__main__":
    filename = "script.py.txt"
    content = "[This is the response]\n"
    content += "STARTLINE=2\n"
    content += "ENDLINE=10\n"
    content += "FILENAME=manual-testing-sandbox\data.json\n"
    content += "\n---\n" + sys.argv[1]
    content += "\n---\n" + sys.argv[2]
    print(content)
    create_file(filename, content)
