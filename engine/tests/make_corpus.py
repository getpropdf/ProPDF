"""Generate the real-world test corpus. Every file mimics documents a CA
office actually handles, with KNOWN ground-truth totals for validation."""
import json
import os
import random
from decimal import Decimal

import fitz
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.environ.get("PROPDF_CORPUS_DIR", os.path.join(HERE, "corpus"))
os.makedirs(OUT, exist_ok=True)
random.seed(42)

W, H = A4


def ifmt(n):
    neg = n < 0
    n = abs(n)
    whole, _, frac = f"{n:.2f}".partition(".")
    if len(whole) > 3:
        head, tail = whole[:-3], whole[-3:]
        parts = []
        while len(head) > 2:
            parts.insert(0, head[-2:])
            head = head[:-2]
        if head:
            parts.insert(0, head)
        whole = ",".join(parts) + "," + tail
    return ("-" if neg else "") + whole + "." + frac


NARRATIONS = [
    "NEFT/HDFC0000123/RENT PAYMENT/SHREE PROPERTIES",
    "UPI/DR/512233445566/GROCERY MART/YESB/9876543210",
    "IMPS/P2A/456789123/SALARY CREDIT ACME PVT LTD",
    "CHQ PAID MICR CTS-2010 KOTHARI JAIN ASSOCIATES",
    "ACH/D/LICINDIA/PREMIUM/000012345678",
    "POS 416021XXXXXX9876 AMAZON RETAIL IN",
    "RTGS/UTIB0000456/ADVANCE AGAINST INVOICE 2214",
    "INT.PD:01-04-2026 TO 30-06-2026",
    "UPI/CR/998877665544/CLIENT FEES/ICIC/PROF SERVICES",
    "GST PAYMENT CBIC/CIN 26071500123456",
]

COLS = [14 * mm, 34 * mm, 54 * mm, 106 * mm, 142 * mm, 168 * mm, 196 * mm]
NARR_WRAP = 30  # chars per narration line (fits column width at 8pt)
HEADERS = ["Date", "Value Dt", "Particulars", "Chq/Ref",
           "Withdrawal(Dr)", "Deposit(Cr)", "Balance"]


def statement_rows(n_rows, opening):
    rows = []
    bal = Decimal(opening)
    d, m, y = 1, 4, 2026
    for i in range(n_rows):
        d += random.randint(0, 2)
        if d > 28:
            d = 1
            m += 1
        debit = credit = None
        if random.random() < 0.55:
            debit = Decimal(random.randint(150, 900000)) / 100 * random.choice([1, 10, 100])
            debit = debit.quantize(Decimal("0.01"))
            bal -= debit
        else:
            credit = Decimal(random.randint(500, 1200000)) / 100 * random.choice([1, 10, 100])
            credit = credit.quantize(Decimal("0.01"))
            bal += credit
        rows.append({
            "date": f"{d:02d}/{m:02d}/{y}", "vdate": f"{d:02d}/{m:02d}/{y}",
            "narr": random.choice(NARRATIONS),
            "ref": str(random.randint(100000, 999999)) if random.random() < 0.6 else "",
            "debit": debit, "credit": credit, "balance": bal,
        })
    return rows


def draw_statement(c, rows, opening, ruled=True, start_y=None, page_no=1, total_pages=1):
    y = start_y or (H - 22 * mm)
    c.setFont("Helvetica-Bold", 13)
    if page_no == 1:
        c.drawString(15 * mm, y, "DEMO BANK OF INDIA — Statement of Account")
        y -= 6 * mm
        c.setFont("Helvetica", 8.5)
        c.drawString(15 * mm, y, "A/c No: 50100123456789   IFSC: DEMO0001234   Branch: MG Road, Pune   Period: 01/04/2026 to 30/06/2026")
        y -= 9 * mm
    c.setFont("Helvetica-Bold", 8.5)
    for x, h in zip(COLS, HEADERS):
        if h.startswith(("With", "Dep", "Bal")):
            c.drawRightString(x, y, h)
        else:
            c.drawString(x, y, h)
    if ruled:
        c.line(13 * mm, y - 1.5 * mm, 198 * mm, y - 1.5 * mm)
        c.line(13 * mm, y + 4 * mm, 198 * mm, y + 4 * mm)
    y -= 6 * mm
    c.setFont("Helvetica", 8)
    if page_no == 1:
        c.drawString(COLS[2], y, "OPENING BALANCE")
        c.drawRightString(COLS[6], y, ifmt(opening))
        y -= 5 * mm
    for r in rows:
        c.drawString(COLS[0], y, r["date"])
        c.drawString(COLS[1], y, r["vdate"])
        narr = r["narr"]
        # multi-line narration wrapped to column width
        c.drawString(COLS[2], y, narr[:NARR_WRAP])
        c.drawString(COLS[3], y, r["ref"])
        if r["debit"] is not None:
            c.drawRightString(COLS[4], y, ifmt(r["debit"]))
        if r["credit"] is not None:
            c.drawRightString(COLS[5], y, ifmt(r["credit"]))
        c.drawRightString(COLS[6], y, ifmt(r["balance"]))
        if ruled:
            c.setStrokeColorRGB(0.85, 0.85, 0.85)
            c.line(13 * mm, y - 1.5 * mm, 198 * mm, y - 1.5 * mm)
            c.setStrokeColorRGB(0, 0, 0)
        y -= 5 * mm
        for k in range(NARR_WRAP, len(narr), NARR_WRAP):
            c.drawString(COLS[2], y, narr[k:k + NARR_WRAP])
            y -= 5 * mm
    c.setFont("Helvetica", 7)
    c.drawCentredString(W / 2, 12 * mm, f"Page {page_no} of {total_pages} — This is a computer generated statement.")
    return y


def make_bank_statement(path, n_rows=95, ruled=True, opening=Decimal("1045780.25")):
    rows = statement_rows(n_rows, opening)
    per_page = 24  # narrations wrap to 2 lines, keep everything above the footer
    pages = [rows[i:i + per_page] for i in range(0, len(rows), per_page)]
    c = canvas.Canvas(path, pagesize=A4)
    for pi, chunk in enumerate(pages):
        draw_statement(c, chunk, opening, ruled=ruled, page_no=pi + 1, total_pages=len(pages))
        c.showPage()
    c.save()
    gt = {
        "opening": str(opening),
        "closing": str(rows[-1]["balance"]),
        "total_debits": str(sum((r["debit"] or Decimal(0)) for r in rows)),
        "total_credits": str(sum((r["credit"] or Decimal(0)) for r in rows)),
        "n_rows": len(rows),
    }
    with open(path + ".json", "w") as f:
        json.dump(gt, f, indent=1)
    return gt


def make_trial_balance(path):
    accounts = [("Capital Account", 0, 2500000), ("Sundry Debtors", 843200.50, 0),
                ("Sundry Creditors", 0, 412870.25), ("Purchases", 1890450.00, 0),
                ("Sales", 0, 2745820.75), ("Salaries", 462000, 0),
                ("Rent Paid", 216000, 0), ("GST Input Credit", 98760.40, 0),
                ("GST Output", 0, 145230.90), ("Cash in Hand", 45210.75, 0),
                ("Bank Balance", 1248300.25, 0)]
    c = canvas.Canvas(path, pagesize=A4)
    c.setFont("Helvetica-Bold", 13)
    c.drawString(20 * mm, H - 20 * mm, "M/s Demo Traders — Trial Balance as at 31/03/2026")
    y = H - 32 * mm
    c.setFont("Helvetica-Bold", 9)
    c.drawString(20 * mm, y, "Particulars")
    c.drawRightString(140 * mm, y, "Debit (Rs.)")
    c.drawRightString(180 * mm, y, "Credit (Rs.)")
    c.line(18 * mm, y - 2 * mm, 185 * mm, y - 2 * mm)
    y -= 8 * mm
    c.setFont("Helvetica", 9)
    td = tc = Decimal(0)
    for name, dr, cr in accounts:
        c.drawString(20 * mm, y, name)
        if dr:
            c.drawRightString(140 * mm, y, ifmt(Decimal(str(dr))))
            td += Decimal(str(dr))
        if cr:
            c.drawRightString(180 * mm, y, ifmt(Decimal(str(cr))))
            tc += Decimal(str(cr))
        y -= 6 * mm
    c.line(18 * mm, y, 185 * mm, y)
    y -= 6 * mm
    c.setFont("Helvetica-Bold", 9)
    c.drawString(20 * mm, y, "TOTAL")
    c.drawRightString(140 * mm, y, ifmt(td))
    c.drawRightString(180 * mm, y, ifmt(tc))
    c.showPage()
    c.save()
    with open(path + ".json", "w") as f:
        json.dump({"total_debit": str(td), "total_credit": str(tc)}, f)


def rasterize(src, dst, dpi=200, rotate=0, quality=70):
    """Turn a text PDF into a scanned-image PDF (optionally rotated/low quality)."""
    doc = fitz.open(src)
    out = fitz.open()
    for page in doc:
        pix = page.get_pixmap(dpi=dpi)
        img = pix.tobytes("jpeg", jpg_quality=quality)
        r = page.rect
        np_ = out.new_page(width=r.width, height=r.height)
        np_.insert_image(r, stream=img, rotate=rotate)
    out.save(dst)
    out.close()
    doc.close()


def make_invoice(path):
    c = canvas.Canvas(path, pagesize=A4)
    c.setFont("Helvetica-Bold", 14)
    c.drawString(20 * mm, H - 20 * mm, "TAX INVOICE")
    c.setFont("Helvetica", 9)
    c.drawString(20 * mm, H - 28 * mm, "Kothari Jain & Associates   GSTIN: 27ABCDE1234F1Z5   Invoice No: KJ/2026/0412   Date: 26/05/2026")
    y = H - 42 * mm
    c.setFont("Helvetica-Bold", 9)
    for x, h in [(20 * mm, "Sr"), (30 * mm, "Description"), (110 * mm, "SAC"),
                 (130 * mm, "Qty"), (150 * mm, "Rate"), (180 * mm, "Amount")]:
        c.drawString(x, y, h)
    y -= 7 * mm
    c.setFont("Helvetica", 9)
    items = [("Statutory Audit FY 2025-26", "998221", 1, 150000),
             ("GST Return Filing (12 months)", "998231", 12, 2500),
             ("Tax Consultancy", "998231", 5, 3000)]
    total = 0
    for i, (desc, sac, qty, rate) in enumerate(items, 1):
        amt = qty * rate
        total += amt
        c.drawString(20 * mm, y, str(i))
        c.drawString(30 * mm, y, desc)
        c.drawString(110 * mm, y, sac)
        c.drawString(130 * mm, y, str(qty))
        c.drawRightString(165 * mm, y, ifmt(Decimal(rate)))
        c.drawRightString(195 * mm, y, ifmt(Decimal(amt)))
        y -= 6 * mm
    y -= 3 * mm
    for label, val in [("Taxable Value", total), ("CGST @9%", total * 0.09),
                       ("SGST @9%", total * 0.09), ("Invoice Total", total * 1.18)]:
        c.setFont("Helvetica-Bold" if "Total" in label else "Helvetica", 9)
        c.drawRightString(165 * mm, y, label)
        c.drawRightString(195 * mm, y, ifmt(Decimal(str(round(val, 2)))))
        y -= 6 * mm
    c.showPage()
    c.save()


def make_text_report(path, pages=3):
    c = canvas.Canvas(path, pagesize=A4)
    for p in range(pages):
        c.setFont("Helvetica-Bold", 16)
        c.drawString(20 * mm, H - 25 * mm, f"Annual Compliance Review 2025-26 — Section {p + 1}")
        c.setFont("Helvetica", 10)
        y = H - 38 * mm
        for i in range(30):
            c.drawString(20 * mm, y, f"Para {p + 1}.{i + 1}: The assessee has maintained books of account as required under "
                                     f"section 44AA and the same were produced for verification during the course of audit.")
            y -= 7 * mm
        c.showPage()
    c.save()


if __name__ == "__main__":
    gt1 = make_bank_statement(os.path.join(OUT, "bank_statement_ruled_multipage.pdf"), 95, ruled=True)
    gt2 = make_bank_statement(os.path.join(OUT, "bank_statement_borderless.pdf"), 40, ruled=False,
                              opening=Decimal("250000.00"))
    make_trial_balance(os.path.join(OUT, "trial_balance.pdf"))
    make_invoice(os.path.join(OUT, "invoice.pdf"))
    make_text_report(os.path.join(OUT, "text_report.pdf"))
    # scanned variants
    rasterize(os.path.join(OUT, "bank_statement_borderless.pdf"),
              os.path.join(OUT, "bank_statement_scanned.pdf"), dpi=200)
    rasterize(os.path.join(OUT, "invoice.pdf"),
              os.path.join(OUT, "invoice_scanned_lowq.pdf"), dpi=120, quality=45)
    rasterize(os.path.join(OUT, "trial_balance.pdf"),
              os.path.join(OUT, "trial_balance_rotated.pdf"), dpi=180, rotate=90)
    print("corpus written to", OUT)
    print("bank ruled GT:", gt1)
    print("bank borderless GT:", gt2)


def make_realistic_statement(path, n_rows=150, opening=Decimal("203122.62")):
    """Replica of a real UPI-heavy statement: header block + table header on
    page 1 ONLY, later pages start the table at the top with no header,
    Value Date column exists in the header but is empty in every row."""
    NARR = [
        "UPI/P2M/509133072327/HungerBox /UPI/YES BANK LIMITED YBS",
        "UPI/P2M/545898274133/PRADIP KUMAR GUPTA /UPI/YES BANK LIMITED YBS",
        "NEFT/HDFCH00164740266/NJ INDIA INVEST PVT LTD 742/HDFC BANK/0001019010100231312",
        "UPI/P2A/546218011771/RUHZAN HOMI SENA /UPI/ICICI Bank",
        "UPI/P2M/546283328090/PRIYA SURESH VISHWAKA/UPI/FEDERAL BANK",
        "UPI/P2M/510135368622/DREAM11 /Paying/RBL BANK LIMITED",
        "NEFT/FBLIC2510125864/LIC INDIA D092/FEDERAL BANK///FAST/////",
        "UPI/P2M/546889168441/SHREE KRUPA BEER SHOP/UPI/YES BANK LIMITED YBS",
        "UPI/P2A/510918893528/CAKES N CAKES ENTERPR/UPI/Svc co-operative ban",
        "UPI/P2M/510918796698/KAMATH WINES /UPI/ICICI Bank",
    ]
    C2 = [14 * mm, 34 * mm, 52 * mm, 104 * mm, 144 * mm, 170 * mm, 196 * mm]
    H2 = ["Date", "Value Date", "Particulars", "Chq No",
          "Withdrawal (Dr)", "Deposit (Cr)", "Balance"]
    rows = []
    bal = Decimal(opening)
    d, m, y = 1, 4, 2025
    for i in range(n_rows):
        d += random.randint(0, 1)
        if d > 28:
            d = 1
            m += 1
        if random.random() < 0.75:
            amt = (Decimal(random.randint(40, 48000)) / Decimal(1)).quantize(Decimal("0.01"))
            debit, credit = amt, None
            bal -= amt
        else:
            amt = (Decimal(random.randint(500, 7500000)) / Decimal(100)).quantize(Decimal("0.01"))
            debit, credit = None, amt
            bal += amt
        rows.append({"date": f"{d:02d}-{m:02d}-{y}", "narr": random.choice(NARR),
                     "ref": str(random.randint(100000, 999999)) if random.random() < 0.15 else "",
                     "debit": debit, "credit": credit, "balance": bal})
    c = canvas.Canvas(path, pagesize=A4)
    first = True
    i = 0
    page = 0
    while i < len(rows):
        page += 1
        y_pos = H - 18 * mm
        if first:
            c.setFont("Helvetica-Bold", 12)
            c.drawString(14 * mm, y_pos, "AXIS DEMO BANK — Statement of Account")
            y_pos -= 5 * mm
            c.setFont("Helvetica", 8)
            c.drawString(14 * mm, y_pos, "A/c: 921010012345678  IFSC: AXDB0000123  Branch: Vasai West  Period: 01-04-2025 to 30-06-2025")
            y_pos -= 8 * mm
            c.setFont("Helvetica-Bold", 8)
            for x, h in zip(C2, H2):
                if h.startswith(("With", "Dep", "Bal")):
                    c.drawRightString(x, y_pos, h)
                else:
                    c.drawString(x, y_pos, h)
            c.line(13 * mm, y_pos - 1.5 * mm, 198 * mm, y_pos - 1.5 * mm)
            y_pos -= 6 * mm
            c.setFont("Helvetica", 7.6)
            c.drawString(C2[2], y_pos, "OPENING BALANCE")
            c.drawRightString(C2[6], y_pos, ifmt(opening))
            y_pos -= 5 * mm
            first = False
        c.setFont("Helvetica", 7.6)
        while i < len(rows) and y_pos > 16 * mm:
            r = rows[i]
            c.drawString(C2[0], y_pos, r["date"])
            narr = r["narr"]
            c.drawString(C2[2], y_pos, narr[:32])
            if r["ref"]:
                c.drawString(C2[3], y_pos, r["ref"])
            if r["debit"] is not None:
                c.drawRightString(C2[4], y_pos, ifmt(r["debit"]))
            if r["credit"] is not None:
                c.drawRightString(C2[5], y_pos, ifmt(r["credit"]))
            c.drawRightString(C2[6], y_pos, ifmt(r["balance"]))
            y_pos -= 4.6 * mm
            if len(narr) > 32:
                c.drawString(C2[2], y_pos, narr[32:64])
                y_pos -= 4.6 * mm
            i += 1
        c.setFont("Helvetica", 6.5)
        c.drawCentredString(W / 2, 9 * mm, f"Page {page} — computer generated, no signature required")
        c.showPage()
    c.save()
    gt = {"opening": str(opening), "closing": str(rows[-1]["balance"]),
          "total_debits": str(sum((r["debit"] or Decimal(0)) for r in rows)),
          "total_credits": str(sum((r["credit"] or Decimal(0)) for r in rows)),
          "n_rows": len(rows)}
    with open(path + ".json", "w") as f:
        json.dump(gt, f, indent=1)
    return gt
