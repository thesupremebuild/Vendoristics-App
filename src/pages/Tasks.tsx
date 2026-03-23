import React, { useState, useEffect } from 'react';
import { useAuth } from '../AuthContext';
import { db } from '../firebase';
import { collection, addDoc, onSnapshot, query, where, doc, updateDoc, deleteDoc, orderBy } from 'firebase/firestore';
import { Plus, CheckCircle2, Circle, Clock, Trash2, User } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'react-hot-toast';

const Tasks: React.FC = () => {
  const { businessId, profile } = useAuth();
  const [tasks, setTasks] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sortBy, setSortBy] = useState<'deadline' | 'priority' | 'createdAt'>('createdAt');
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    priority: 'medium',
    deadline: '',
    assignedTo: ''
  });

  useEffect(() => {
    if (!businessId) return;
    const tasksRef = collection(db, 'businesses', businessId, 'tasks');
    const unsubscribe = onSnapshot(query(tasksRef), (snapshot) => {
      setTasks(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, [businessId]);

  const priorityMap: Record<string, number> = { high: 3, medium: 2, low: 1 };

  const sortedTasks = [...tasks].sort((a, b) => {
    // Always keep pending tasks at top, then sort by selected criteria
    if (a.status !== b.status) {
      return a.status === 'pending' ? -1 : 1;
    }

    if (sortBy === 'deadline') {
      if (!a.deadline) return 1;
      if (!b.deadline) return -1;
      return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
    }
    if (sortBy === 'priority') {
      return priorityMap[b.priority] - priorityMap[a.priority];
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessId) return;
    setLoading(true);
    try {
      await addDoc(collection(db, 'businesses', businessId, 'tasks'), {
        ...formData,
        status: 'pending',
        businessId,
        createdAt: new Date().toISOString()
      });
      toast.success('Task created');
      setShowModal(false);
      setFormData({ title: '', description: '', priority: 'medium', deadline: '', assignedTo: '' });
    } catch (error) {
      toast.error('Failed to create task');
    } finally {
      setLoading(false);
    }
  };

  const toggleStatus = async (task: any) => {
    try {
      await updateDoc(doc(db, 'businesses', businessId!, 'tasks', task.id), {
        status: task.status === 'completed' ? 'pending' : 'completed'
      });
    } catch (error) {
      toast.error('Update failed');
    }
  };

  const deleteTask = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'businesses', businessId!, 'tasks', id));
      toast.success('Task deleted');
    } catch (error) {
      toast.error('Delete failed');
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Task Management</h2>
          <p className="text-slate-500">Track and assign business tasks.</p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <select 
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
          >
            <option value="createdAt">Sort by: Date Created</option>
            <option value="deadline">Sort by: Deadline</option>
            <option value="priority">Sort by: Priority</option>
          </select>
          <button 
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-3 rounded-xl font-semibold transition-all shadow-lg shadow-emerald-500/20"
          >
            <Plus size={20} />
            New Task
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4">
        {sortedTasks.map(task => (
          <div 
            key={task.id} 
            className={`bg-white p-4 rounded-2xl border transition-all flex items-start gap-4 ${
              task.status === 'completed' ? 'border-slate-100 opacity-60' : 'border-slate-100 hover:border-emerald-200'
            }`}
          >
            <button 
              onClick={() => toggleStatus(task)}
              className={`mt-1 transition-colors ${task.status === 'completed' ? 'text-emerald-500' : 'text-slate-300 hover:text-emerald-500'}`}
            >
              {task.status === 'completed' ? <CheckCircle2 size={24} /> : <Circle size={24} />}
            </button>
            
            <div className="flex-1">
              <h3 className={`font-semibold ${task.status === 'completed' ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                {task.title}
              </h3>
              {task.description && (
                <p className={`text-sm mt-1 mb-2 ${task.status === 'completed' ? 'text-slate-400' : 'text-slate-600'}`}>
                  {task.description}
                </p>
              )}
              <div className="flex items-center gap-4 mt-1">
                <span className="flex items-center gap-1 text-xs text-slate-400">
                  <Clock size={12} />
                  {task.deadline ? format(new Date(task.deadline), 'MMM dd, HH:mm') : 'No deadline'}
                </span>
                <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full ${
                  task.priority === 'high' ? 'bg-red-100 text-red-600' : 
                  task.priority === 'medium' ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'
                }`}>
                  {task.priority}
                </span>
              </div>
            </div>

            <button 
              onClick={() => deleteTask(task.id)}
              className="p-2 text-slate-300 hover:text-red-500 transition-colors"
            >
              <Trash2 size={18} />
            </button>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-xl font-bold text-slate-900">Create New Task</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                <Plus size={24} className="rotate-45" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Task Title</label>
                <input 
                  required
                  type="text" 
                  value={formData.title}
                  onChange={(e) => setFormData({...formData, title: e.target.value})}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  placeholder="What needs to be done?"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Description</label>
                <textarea 
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  placeholder="Additional details..."
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Priority</label>
                  <select 
                    value={formData.priority}
                    onChange={(e) => setFormData({...formData, priority: e.target.value})}
                    className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Deadline</label>
                  <input 
                    type="datetime-local" 
                    value={formData.deadline}
                    onChange={(e) => setFormData({...formData, deadline: e.target.value})}
                    className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>
              </div>
              <button 
                disabled={loading}
                type="submit"
                className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-xl font-bold transition-all disabled:opacity-50"
              >
                {loading ? 'Creating...' : 'Create Task'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Tasks;
