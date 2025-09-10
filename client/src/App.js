import React, { useState, useEffect, useRef } from 'react';

function App() {
  const [date, setDate] = useState('');
  const [hours, setHours] = useState('');
  const [content, setContent] = useState('');
  const [message, setMessage] = useState(null);
  const [messageType, setMessageType] = useState(null);
  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [totalHours, setTotalHours] = useState(0);
  const [editingCell, setEditingCell] = useState({ rowIndex: null, field: null, value: '' });
  const [editingCardRowIndex, setEditingCardRowIndex] = useState(null);
  const [editCardForm, setEditCardForm] = useState({ day: '', hours: '', content: '' });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const API_BASE = process.env.REACT_APP_API_BASE || '';

  const formRef = useRef(null); // Ref for the form element

  useEffect(() => {
    // Set today's date as default
    const today = new Date().toISOString().split('T')[0];
    setDate(today);
    fetchRecords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Function to display alerts
  const showAlert = (msg, type) => {
    setMessage(msg);
    setMessageType(type);
    // Auto-hide success alerts
    if (type === 'success') {
      setTimeout(() => setMessage(null), 5000);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault(); // Prevent traditional form submission

    setLoading(true);
    setMessage(null); // Clear previous messages

    // Get form data
    const formData = new FormData(formRef.current);
    const data = {
      date: formData.get('date'),
      hours: formData.get('hours'),
      content: formData.get('content'),
    };

    try {
      const response = await fetch(`${API_BASE}/api/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (response.ok) {
        showAlert(result.message, 'success');
        // Clear form fields after successful submission, but keep today's date
        setHours('');
        setContent('');
        // Reset date to today after successful submission
        setDate(new Date().toISOString().split('T')[0]);
        // Refresh records after successful submission
        fetchRecords();
      }
      else {
        showAlert(result.message || 'エラーが発生しました。', 'danger');
      }
    } catch (error) {
      console.error('Error submitting form:', error);
      showAlert('通信エラーが発生しました。コンソールを確認してください。', 'danger');
    } finally {
      setLoading(false);
    }
  };

  const fetchRecords = async () => {
    try {
      setLoadingRecords(true);
      const res = await fetch(`${API_BASE}/api/records`);
      const data = await res.json();
      if (res.ok) {
        setRecords(data.records || []);
        setTotalHours(data.totalHours || 0);
      }
    } catch (err) {
      console.error('Error fetching records:', err);
    } finally {
      setLoadingRecords(false);
    }
  };

  // セル編集（テーブルUI）は非使用だが、将来拡張のため残置

  const cancelEditCell = () => {
    setEditingCell({ rowIndex: null, field: null, value: '' });
  };

  // セル編集保存（未使用）

  const deleteRow = async (rowIndex, { skipConfirm } = {}) => {
    if (!skipConfirm) {
      if (!window.confirm('この行を削除しますか？')) return;
    }
    try {
      setIsDeleting(true);
      const res = await fetch(`${API_BASE}/api/records/${rowIndex}`, { method: 'DELETE' });
      if (res.ok) {
        if (editingCell.rowIndex === rowIndex) cancelEditCell();
        if (editingCardRowIndex === rowIndex) cancelEditCard();
        fetchRecords();
      }
    } catch (e) {
      console.error('Failed to delete row', e);
    } finally {
      setIsDeleting(false);
    }
  };

  const openEditCard = (record) => {
    setEditingCardRowIndex(record.rowIndex);
    setEditCardForm({ day: record.day || '', hours: record.hours || '', content: record.content || '' });
    setIsModalOpen(true);
  };

  const cancelEditCard = () => {
    setEditingCardRowIndex(null);
    setEditCardForm({ day: '', hours: '', content: '' });
    setIsModalOpen(false);
  };

  const saveEditCard = async () => {
    if (!editingCardRowIndex) return;
    try {
      setIsSaving(true);
      const res = await fetch(`${API_BASE}/api/records/${editingCardRowIndex}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editCardForm),
      });
      if (res.ok) {
        cancelEditCard();
        fetchRecords();
      }
    } catch (e) {
      console.error('Failed to save edit (card)', e);
    } finally {
      setIsSaving(false);
    }
  };


  return (
    <>
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet" integrity="sha384-T3c6CoIi6uLrA9TneNEoa7RxnatzjcDSCmG1MXxSR1GAsXEV/Dwwykc2MPK8M2HN" crossOrigin="anonymous" />
      <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet" />
      <nav className="navbar navbar-expand-lg navbar-dark bg-dark">
        <div className="container-fluid">
          <span className="navbar-brand fw-bold">
            <i className="fas fa-clock me-2"></i>時間管理アプリ
          </span>
        </div>
      </nav>

      <main className="container mt-5">
        {message && (
          <div className={`alert alert-${messageType} alert-dismissible fade show border-0 shadow-sm`} role="alert" style={{borderRadius: '15px'}}>
            <i className={`fas ${messageType === 'success' ? 'fa-check-circle' : 'fa-exclamation-triangle'} me-2`}></i>
            {message}
            <button type="button" className="btn-close" onClick={() => setMessage(null)} aria-label="Close"></button>
          </div>
        )}
        
        {/* 合計情報表示エリア */}
        <div className="row mb-4">
          <div className="col-12">
            <div className="card border-0 shadow-sm" style={{background: '#f8f9fa'}}>
              <div className="card-body p-3">
                <div className="d-flex justify-content-around">
                  <div>
                    <div className="d-flex gap-2 justify-content-start justify-content-lg-center align-items-center">
                      <div>
                        <small className="text-muted d-block text-start" style={{lineHeight: 1}}>合計稼働時間</small>
                        <h6 className="mb-0 fw-bold text-dark">{totalHours.toFixed(1)}時間</h6>
                      </div>
                    </div>
                  </div>
                  <div>
                    <div className="d-flex gap-2 justify-content-start justify-content-lg-center align-items-center">
                      <div>
                        <small className="text-muted d-block text-start" style={{lineHeight: 1}}>単価</small>
                        <h6 className="mb-0 fw-bold text-dark">¥4,000</h6>
                      </div>
                    </div>
                  </div>
                  <div>
                    <div className="d-flex gap-2 justify-content-start justify-content-lg-center align-items-center">
                      <div>
                        <small className="text-muted d-block text-start" style={{lineHeight: 1}}>合計金額</small>
                        <h6 className="mb-0 fw-bold text-dark">¥{(totalHours * 4000).toLocaleString()}</h6>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div className="row">
          {/* データ記録フォーム - PCでは左側、モバイルでは上側 */}
          <div className="col-lg-4 col-md-6 mb-4">
            <div className="card border-0 shadow-sm h-100">
              <div className="card-body p-3">
                <h5 className="card-title mb-3 text-dark fw-bold mt-1">
                  <i className="fas fa-plus-circle me-2 text-primary"></i>データ記録
                </h5>
                <form onSubmit={handleSubmit} ref={formRef}>
                  <div className="mb-3">
                    <label htmlFor="date" className="form-label text-dark fw-semibold">
                      <i className="fas fa-calendar-alt me-2 text-muted"></i>日付
                    </label>
                    <input
                      type="date"
                      className="form-control"
                      id="date"
                      name="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      required
                    />
                  </div>
                  <div className="mb-3">
                    <label htmlFor="hours" className="form-label text-dark fw-semibold">
                      <i className="fas fa-clock me-2 text-muted"></i>稼働時間 (工数)
                    </label>
                    <input
                      type="number"
                      className="form-control"
                      id="hours"
                      name="hours"
                      step="0.1"
                      placeholder="例: 7.5"
                      value={hours}
                      onChange={(e) => setHours(e.target.value)}
                      required
                    />
                  </div>
                  <div className="mb-3">
                    <label htmlFor="content" className="form-label text-dark fw-semibold">
                      <i className="fas fa-tasks me-2 text-muted"></i>内容
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      id="content"
                      name="content"
                      placeholder="例: 新機能の設計"
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      required
                    />
                  </div>
                  <div className="d-grid mt-3">
                    <button type="submit" className="btn btn-primary" disabled={loading}>
                      {loading ? (
                        <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                      ) : (
                        <>
                          <i className="fas fa-save me-2"></i>記録する
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>

          {/* 記録一覧テーブル - PCでは右側、モバイルでは下側 */}
          <div className="col-lg-8 col-md-6">
            <div className="card border-0 shadow-sm h-100">
              <div className="card-body p-3">
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <h5 className="m-0 text-dark fw-bold">
                    <i className="fas fa-list-alt me-2 text-primary"></i>記録一覧
                  </h5>
                  <button className="btn btn-outline-secondary btn-sm" onClick={fetchRecords} disabled={loadingRecords}>
                    {loadingRecords ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>更新中...
                      </>
                    ) : (
                      <>
                        <i className="fas fa-sync-alt me-2"></i>再読込
                      </>
                    )}
                  </button>
                </div>
                <div style={{maxHeight: '500px', overflowY: 'auto', overflowX: 'hidden'}}>
                  {records.length === 0 ? (
                    <div className="text-center text-muted py-4">
                      <i className="fas fa-inbox fa-lg mb-2 d-block opacity-50"></i>
                      データがありません
                    </div>
                  ) : (
                    <div className="row g-3">
                      {records.filter(r => r.rowIndex >= 2).map((r) => (
                        <div className="col-12" key={r.rowIndex}>
                          <div className="card border-0 shadow-sm" role="button" onClick={()=>openEditCard(r)}>
                            <div className="card-body py-3 px-3">
                              <div className="d-flex flex-wrap align-items-center justify-content-between">
                                <div className="d-flex align-items-center gap-3">
                                  <span className="badge bg-light text-dark border"><i className="fas fa-calendar-day me-1 text-muted"></i>{r.day || '-'}</span>
                                  <span className="badge bg-primary"><i className="fas fa-clock me-1"></i>{r.hours || '-'}</span>
                                </div>
                                <div className="text-truncate" style={{maxWidth: '60%'}}>{r.content || '-'}</div>
                                <div className="text-muted small">#{r.rowIndex}</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 編集モーダル */}
                {isModalOpen && (
                  <div className="modal fade show" style={{display: 'block', backgroundColor: 'rgba(0,0,0,0.4)'}} tabIndex="-1" role="dialog" aria-modal="true">
                    <div className="modal-dialog modal-dialog-centered">
                      <div className="modal-content">
                        <div className="modal-header">
                          <h5 className="modal-title">記録の編集</h5>
                          <button type="button" className="btn-close" onClick={cancelEditCard} aria-label="Close"></button>
                        </div>
                        <div className="modal-body">
                          <div className="mb-3">
                            <label className="form-label">日</label>
                            <input type="text" className="form-control" value={editCardForm.day} onChange={(e)=>setEditCardForm({...editCardForm, day: e.target.value})} />
                          </div>
                          <div className="mb-3">
                            <label className="form-label">工数</label>
                            <input type="number" step="0.1" className="form-control" value={editCardForm.hours} onChange={(e)=>setEditCardForm({...editCardForm, hours: e.target.value})} />
                          </div>
                          <div className="mb-3">
                            <label className="form-label">内容</label>
                            <input type="text" className="form-control" value={editCardForm.content} onChange={(e)=>setEditCardForm({...editCardForm, content: e.target.value})} />
                          </div>
                        </div>
                        <div className="modal-footer d-flex justify-content-between">
                          <button type="button" className="btn btn-outline-danger" disabled={isDeleting} onClick={()=>deleteRow(editingCardRowIndex, { skipConfirm: true })}>
                            {isDeleting ? (
                              <>
                                <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>削除中...
                              </>
                            ) : (
                              <>
                                <i className="fas fa-trash-alt me-1"></i>削除
                              </>
                            )}
                          </button>
                          <div>
                            <button type="button" className="btn btn-outline-secondary me-2" onClick={cancelEditCard} disabled={isSaving || isDeleting}>取消</button>
                            <button type="button" className="btn btn-primary" onClick={saveEditCard} disabled={isSaving}>
                              {isSaving ? (
                                <>
                                  <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>保存中...
                                </>
                              ) : (
                                '保存'
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}

export default App;
