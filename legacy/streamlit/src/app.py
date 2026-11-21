import streamlit as st
import pandas as pd
from datetime import datetime, time
from pathlib import Path

# ---------------- CONFIG ----------------
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "storage"
LOG_DIR = DATA_DIR / "logs"
PRODUCT_MASTER = BASE_DIR / "data" / "APT_Production_Master.xlsx"

MACHINES = ["vim1", "vim2", "vim3", "vim4", "him"]

CSV_COLUMNS = ["log_datetime", "component_name", "component_id", "quantity"]

# Ensure folders exist
DATA_DIR.mkdir(exist_ok=True)
LOG_DIR.mkdir(exist_ok=True)

# ---------------- LOAD PRODUCT MASTER ----------------
@st.cache_data
def load_products():
    df = pd.read_excel(PRODUCT_MASTER)
    return df

product_df = load_products()

# ---------------- UI ----------------
st.title("Hourly Production Logging")

st.subheader("User Details")
entered_by = st.text_input("Entered By (Your Name)")
operator_name = st.text_input("Operator Name")

st.subheader("Machine & Time")
machine = st.selectbox("Machine", MACHINES)

prod_date = st.date_input("Production Date", value=datetime.today())
prod_time = st.time_input(
    "Production Time",
    value=time(hour=datetime.now().hour, minute=0)
)

st.subheader("Product Details")
component_name = st.selectbox(
    "Component Name",
    product_df["component_name"].unique()
)

component_id = product_df.loc[
    product_df["component_name"] == component_name,
    "component_id"
].iloc[0]

st.text_input("Component ID", component_id, disabled=True)

quantity = st.number_input("Quantity", min_value=1, step=1)

# ---------------- SUBMIT ----------------
if st.button("Submit Entry"):
    # ---- Validation ----
    if not entered_by.strip() or not operator_name.strip():
        st.error("Both 'Entered By' and 'Operator Name' are required.")
        st.stop()

    production_datetime = datetime.combine(prod_date, prod_time)

    if production_datetime > datetime.now():
        st.error("Production time cannot be in the future.")
        st.stop()

    # ---- CSV Append ----
    csv_path = DATA_DIR / f"{machine}.csv"

    row = {
        "log_datetime": production_datetime.strftime("%Y-%m-%d %H:%M"),
        "component_name": component_name,
        "component_id": component_id,
        "quantity": int(quantity)
    }

    df_row = pd.DataFrame([row])
    df_row.to_csv(
        csv_path,
        mode="a",
        header=not csv_path.exists(),
        index=False
    )

    # ---- LOG Append ----
    system_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    log_line = (
        f"[{system_time}] "
        f"EnteredBy:{entered_by} | "
        f"Operator:{operator_name} | "
        f"ProdTime:{row['log_datetime']} | "
        f"Component:{component_id} | "
        f"Qty:{quantity} | "
        f"Machine:{machine} | "
        f"File:{machine}.csv\n"
    )

    log_path = LOG_DIR / f"{machine}.log"
    with open(log_path, "a") as log_file:
        log_file.write(log_line)

    st.success("Entry logged successfully ✔")
