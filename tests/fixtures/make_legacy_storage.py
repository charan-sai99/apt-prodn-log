"""Builds a legacy `storage/` folder with the EXACT write logic of the old
Streamlit app (src/app.py, submit block), including deliberate problems, so the
migration utility can be tested end-to-end. Usage: python3 make_legacy_storage.py <out_dir>"""
import sys
from pathlib import Path
import pandas as pd

out = Path(sys.argv[1]); (out / "logs").mkdir(parents=True, exist_ok=True)

def submit(entered_by, operator_name, machine, log_datetime, component_name, component_id, quantity, system_time):
    # --- verbatim from legacy app.py ---
    csv_path = out / f"{machine}.csv"
    row = {"log_datetime": log_datetime, "component_name": component_name, "component_id": component_id, "quantity": int(quantity)}
    pd.DataFrame([row]).to_csv(csv_path, mode="a", header=not csv_path.exists(), index=False)
    log_line = (f"[{system_time}] EnteredBy:{entered_by} | Operator:{operator_name} | ProdTime:{row['log_datetime']} | "
                f"Component:{component_id} | Qty:{quantity} | Machine:{machine} | File:{machine}.csv\n")
    with open(out / "logs" / f"{machine}.log", "a") as f:
        f.write(log_line)

S = "STAR BASIC (NEW) SPEEDO POINTER ASSEMBLY - ORANGE"
submit("Suresh", "Ravi", "vim1", "2026-01-05 08:00", "N45 SPEEDO POINTER ASSEMBLY", "COM-SPA-00018", 240, "2026-01-05 09:02:11")
submit("Suresh", "Ravi", "vim1", "2026-01-05 09:00", S, "COM-SPA-00021", 300, "2026-01-05 10:01:40")
submit("Suresh", "Ravi", "vim1", "2026-01-05 09:00", S, "COM-SPA-00021", 300, "2026-01-05 10:01:52")   # double submission
submit("Suresh", "Ravi", "vim1", "2026-01-05 10:30", "TVS STAR DIAL SPACER", "COM-SOP-00006", 75, "2026-01-05 11:00:03")  # minutes != 0
submit("Anita", "Kumar", "vim2", "2026-01-05 08:00", "N45 FUEL GAUGE POINTER ASSEMBLY", "COM-SPA-00008", 180, "2026-01-05 09:10:00")
submit("Anita", "Kumar", "vim2", "2026-01-05 08:00", "N45 FUEL GAUGE POINTER ASSEMBLY", "COM-SPA-00008", 190, "2026-01-05 09:12:00")  # conflicting qty
submit("Anita", "Kumar", "vim2", "2026-01-05 09:00", "OLD DISCONTINUED PART", "COM-XXX-99999", 50, "2026-01-05 10:00:00")  # not in master
submit("test", "test", "him", "2026-01-06 08:00", "N45 SPEEDO POINTER ASSEMBLY", "COM-SPA-00018", 1, "2026-01-06 08:30:00")  # test data
submit("Meena", "Lakshmi", "him", "2026-01-06 09:00", "HDPE INNER CAP SMALL", "", 500, "2026-01-06 10:00:00")  # no part code in master
# A CSV row whose log line was lost:
with open(out / "vim3.csv", "w") as f:
    f.write("log_datetime,component_name,component_id,quantity\n2026-01-07 08:00,TVS STAR DIAL SPACER,COM-SOP-00006,60\n")
print("ok", out)
