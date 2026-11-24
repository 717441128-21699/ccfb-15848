import sys
sys.path.insert(0, r"D:\codex\runs\15848\workspace\.pylibs")
import pymupdf  # noqa: E402

pdf, out = sys.argv[1], sys.argv[2]
doc = pymupdf.open(pdf)
with open(out, "w", encoding="utf-8") as f:
    for i, page in enumerate(doc):
        f.write(f"\n===== PAGE {i+1} =====\n")
        f.write(page.get_text("text"))
print("pages:", len(doc))
