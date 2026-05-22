import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../../../api/api";
import "./Css/rewardForm.css";

const RewardForm: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    name: "",
    reward_type: "percentage",
    reward_value: "",
    max_reward: "",
    min_order_amount: "",
    max_order_amount: "", // <--- 1. ADDED TO STATE
    source_type: "product",
    is_active: 1,
    description: "",
    start_date: "",
    end_date: "",
    priority: 1,
    is_stackable: 0,
    expiry_days: 90,
  });

  useEffect(() => {
    if (isEdit) fetchRule();
  }, [id]);

  const fetchRule = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/reward/get-rule/${id}`);
      if (res.data.success) {
        // Ensure max_order_amount is mapped correctly from API
        setForm({ ...res.data?.data });
      }
    } catch (err) {
      console.error(err);
      alert("Failed to load rule");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >,
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      const payload = {
        ...form,
        reward_value: Number(form.reward_value),
        max_reward: form.max_reward ? Number(form.max_reward) : null,
        min_order_amount: Number(form.min_order_amount),
        max_order_amount: form.max_order_amount
          ? Number(form.max_order_amount)
          : null, // <--- 2. ADDED TO PAYLOAD
        priority: Number(form.priority),
        is_stackable: Number(form.is_stackable),
        expiry_days: Number(form.expiry_days),
      };
      isEdit
        ? await api.put(`/reward/update-rule/${id}`, payload)
        : await api.post(`/reward/create-rule`, payload);
      navigate("/manager/rewards-rule");
    } catch (err) {
      console.error(err);
      alert("Failed to save rule");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="order-page">
      <div className="form-container">
        <h2 style={{ marginBottom: "24px", fontSize: "24px", color: "#111" }}>
          {isEdit ? "Edit Reward Rule" : "Create Reward Rule"}
        </h2>

        <form onSubmit={handleSubmit}>
          {/* SECTION: BASIC */}
          <h3>Basic Details</h3>
          <div className="form-row">
            <div className="form-group">
              <label>Rule Name</label>
              <input
                type="text"
                name="name"
                value={form.name}
                onChange={handleChange}
                placeholder="e.g. Summer Cashback"
                required
              />
            </div>
            <div className="form-group">
              <label>Reward Type</label>
              <select
                name="reward_type"
                value={form.reward_type}
                onChange={handleChange}
              >
                <option value="percentage">Percentage (%)</option>
                <option value="fixed">Fixed (₹)</option>
              </select>
            </div>
          </div>

          {/* SECTION: CONFIG (Updated to 2x2 layout) */}
          <h3>Reward Configuration</h3>
          <div className="form-row">
            <div className="form-group">
              <label>Reward Value</label>
              <input
                type="number"
                name="reward_value"
                value={form.reward_value}
                onChange={handleChange}
                required
              />
            </div>
            <div className="form-group">
              <label>Max Reward (Limit)</label>
              <input
                type="number"
                name="max_reward"
                value={form.max_reward}
                onChange={handleChange}
                placeholder="Optional"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Min Order Amount</label>
              <input
                type="number"
                name="min_order_amount"
                value={form.min_order_amount}
                onChange={handleChange}
                required
              />
            </div>
            <div className="form-group">
              <label>Max Order Amount</label> {/* <--- 3. ADDED TO UI */}
              <input
                type="number"
                name="max_order_amount"
                value={form.max_order_amount}
                onChange={handleChange}
                placeholder="Optional"
              />
            </div>
          </div>

          {/* SECTION: ADVANCED */}
          <h3>Advanced Settings</h3>
          <div className="form-group">
            <label>Description</label>
            <textarea
              name="description"
              value={form.description}
              onChange={handleChange}
              rows={3}
              style={{
                padding: "10px",
                borderRadius: "8px",
                border: "1px solid #dcdcdc",
              }}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Source Type</label>
              <select
                name="source_type"
                value={form.source_type}
                onChange={handleChange}
              >
                <option value="product">Product</option>
                <option value="service">Service</option>
                <option value="steps">Steps</option>
                <option value="referral">Referral</option>
                <option value="payment">Payment</option>
              </select>
            </div>
            <div className="form-group">
              <label>Priority</label>
              <input
                type="number"
                name="priority"
                value={form.priority}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Start Date</label>
              <input
                type="date"
                name="start_date"
                value={form.start_date ? form.start_date.split(" ")[0] : ""}
                onChange={handleChange}
              />
            </div>
            <div className="form-group">
              <label>End Date</label>
              <input
                type="date"
                name="end_date"
                value={form.end_date ? form.end_date.split(" ")[0] : ""}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="form-group" style={{ width: "48.8%" }}>
            <label>Expiry Days</label>
            <input
              type="number"
              name="expiry_days"
              value={form.expiry_days}
              onChange={handleChange}
            />
          </div>

          {/* SECTION: TOGGLES */}
          <div className="toggle-section">
            <div className="toggle-item">
              <span className="label-text">Active Status</span>
              <div
                className={`toggle ${form.is_active ? "active" : ""}`}
                onClick={() =>
                  setForm((f) => ({ ...f, is_active: f.is_active ? 0 : 1 }))
                }
              >
                <div className="toggle-circle"></div>
              </div>
            </div>

            <div className="toggle-item">
              <span className="label-text">Stackable with other offers</span>
              <div
                className={`toggle ${form.is_stackable ? "active" : ""}`}
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    is_stackable: f.is_stackable ? 0 : 1,
                  }))
                }
              >
                <div className="toggle-circle"></div>
              </div>
            </div>
          </div>

          <div
            className="actions"
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "12px",
              marginTop: "30px",
            }}
          >
            <button
              type="button"
              className="cancel-btn"
              onClick={() => navigate("/manager/rewards-rule")}
            >
              Cancel
            </button>
            <button type="submit" className="save-btn" disabled={loading}>
              {loading
                ? "Processing..."
                : isEdit
                  ? "Update Rule"
                  : "Create Rule"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RewardForm;
