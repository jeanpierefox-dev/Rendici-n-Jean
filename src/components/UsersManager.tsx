import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { User } from '../types';
import { useAppStore } from '../lib/store';
import { 
  UserPlus, Pencil, Trash2, Shield, User as UserIcon, 
  Lock, Building, Search, X, Check, Eye, EyeOff, AlertCircle, ShieldAlert 
} from 'lucide-react';

export function UsersManager() {
  const { currentUser } = useAppStore();
  const [users, setUsers] = useState<User[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  // Form State
  const [showForm, setShowForm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'user' | 'admin'>('user');
  const [department, setDepartment] = useState('General');
  
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');

  // 1. Subscribe to users collection in Firestore
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'users'),
      (snapshot) => {
        const usersList: User[] = [];
        snapshot.forEach((doc) => {
          usersList.push({
            ...(doc.data() as Omit<User, 'id'>),
            id: doc.id,
          });
        });
        // Sort users: admins first, then by name
        usersList.sort((a, b) => {
          if (a.role === 'admin' && b.role !== 'admin') return -1;
          if (a.role !== 'admin' && b.role === 'admin') return 1;
          return a.name.localeCompare(b.name);
        });
        setUsers(usersList);
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching users:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Filter users based on search term
  const filteredUsers = users.filter((u) => {
    const term = searchTerm.toLowerCase();
    const cleanId = u.id.replace(/^user_/, '');
    return (
      u.name.toLowerCase().includes(term) ||
      cleanId.toLowerCase().includes(term) ||
      (u.email && u.email.toLowerCase().includes(term)) ||
      (u.department && u.department.toLowerCase().includes(term))
    );
  });

  const handleOpenCreate = () => {
    setIsEditing(false);
    setEditingUserId(null);
    setName('');
    setUsername('');
    setPassword('');
    setRole('user');
    setDepartment('General');
    setFormError('');
    setFormSuccess('');
    setShowForm(true);
  };

  const handleOpenEdit = (user: User) => {
    setIsEditing(true);
    setEditingUserId(user.id);
    setName(user.name);
    // Strip "user_" prefix for display
    const displayUsername = user.id.replace(/^user_/, '');
    setUsername(displayUsername);
    setPassword(user.password || '');
    setRole(user.role);
    setDepartment(user.department || 'General');
    setFormError('');
    setFormSuccess('');
    setShowForm(true);
  };

  const handleDeleteUser = async (userToDelete: User) => {
    if (userToDelete.id === currentUser?.id) {
      alert('No puedes eliminar tu propio usuario administrador activo.');
      return;
    }

    const confirmDelete = window.confirm(
      `¿Estás seguro de que deseas eliminar al usuario "${userToDelete.name}" (${userToDelete.id.replace(/^user_/, '')})? Esta acción no se puede deshacer y el usuario perderá acceso inmediato.`
    );

    if (confirmDelete) {
      try {
        await deleteDoc(doc(db, 'users', userToDelete.id));
        setFormSuccess('Usuario eliminado con éxito');
        setTimeout(() => setFormSuccess(''), 3000);
      } catch (error) {
        console.error('Error deleting user:', error);
        setFormError('No se pudo eliminar el usuario.');
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');

    const cleanName = name.trim();
    const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    const cleanPassword = password.trim();

    if (!cleanName) {
      setFormError('Por favor ingresa el nombre completo.');
      return;
    }
    if (!cleanUsername) {
      setFormError('Por favor ingresa un nombre de usuario válido (solo letras, números y guiones bajos).');
      return;
    }
    if (!cleanPassword) {
      setFormError('Por favor ingresa una contraseña.');
      return;
    }

    const targetId = `user_${cleanUsername}`;

    try {
      if (!isEditing) {
        // Check if username already exists
        const exists = users.some((u) => u.id === targetId);
        if (exists) {
          setFormError('Este nombre de usuario ya está registrado.');
          return;
        }
      }

      const userDoc: User = {
        id: targetId,
        name: cleanName,
        role: role,
        password: cleanPassword,
        email: `${cleanUsername}@empresa.com`,
        department: department,
        createdAt: isEditing 
          ? (users.find(u => u.id === targetId)?.createdAt || new Date().toISOString())
          : new Date().toISOString()
      };

      await setDoc(doc(db, 'users', targetId), userDoc, { merge: true });
      
      setFormSuccess(isEditing ? 'Usuario actualizado con éxito!' : 'Usuario creado con éxito!');
      
      setTimeout(() => {
        setShowForm(false);
        setFormSuccess('');
      }, 1000);
    } catch (error) {
      console.error('Error saving user to Firestore:', error);
      setFormError('Error al guardar el usuario en la base de datos.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Gestión de Usuarios</h2>
          <p className="text-sm text-gray-500 mt-1">Crea, edita y elimina las cuentas de colaboradores y administradores.</p>
        </div>
        <button
          onClick={handleOpenCreate}
          className="flex items-center px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm cursor-pointer"
        >
          <UserPlus className="w-4 h-4 mr-2" />
          Nuevo Usuario
        </button>
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Users List (Takes 2 cols if form is open, otherwise full 3 cols) */}
        <div className={`bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden transition-all ${showForm ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
          {/* List Toolbar */}
          <div className="p-5 border-b border-gray-200 flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="relative w-full sm:max-w-xs">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
                <Search className="w-4 h-4" />
              </span>
              <input
                type="text"
                placeholder="Buscar por nombre, usuario, área..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
              />
            </div>
            <div className="text-xs text-gray-500 font-medium">
              Mostrando {filteredUsers.length} de {users.length} usuarios
            </div>
          </div>

          {/* Table */}
          {loading ? (
            <div className="p-12 text-center text-gray-500 font-medium">Cargando usuarios...</div>
          ) : filteredUsers.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <ShieldAlert className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="font-semibold text-gray-700">No se encontraron usuarios</p>
              <p className="text-xs text-gray-400 mt-1">Prueba cambiando los términos de búsqueda.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    <th className="px-6 py-4">Nombre Completo</th>
                    <th className="px-6 py-4">Usuario</th>
                    <th className="px-6 py-4">Área / Depto</th>
                    <th className="px-6 py-4">Rol</th>
                    <th className="px-6 py-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm">
                  {filteredUsers.map((u) => {
                    const isSelf = u.id === currentUser?.id;
                    return (
                      <tr key={u.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className={`w-9 h-9 rounded-full flex items-center justify-center mr-3 font-semibold text-sm ${u.role === 'admin' ? 'bg-indigo-50 text-indigo-700' : 'bg-blue-50 text-blue-700'}`}>
                              {u.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-semibold text-gray-900 flex items-center">
                                {u.name}
                                {isSelf && (
                                  <span className="ml-2 text-[10px] font-bold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                                    Tú
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-gray-500">{u.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap font-mono text-xs text-gray-600">
                          {u.id.replace(/^user_/, '')}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-gray-600">
                          <span className="inline-flex items-center text-xs">
                            <Building className="w-3.5 h-3.5 mr-1.5 text-gray-400" />
                            {u.department || 'General'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${u.role === 'admin' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
                            {u.role === 'admin' ? (
                              <>
                                <Shield className="w-3 h-3 mr-1" />
                                Administrador
                              </>
                            ) : (
                              <>
                                <UserIcon className="w-3 h-3 mr-1" />
                                Colaborador
                              </>
                            )}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <div className="flex items-center justify-end space-x-1">
                            <button
                              onClick={() => handleOpenEdit(u)}
                              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors cursor-pointer"
                              title="Editar Usuario"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteUser(u)}
                              disabled={isSelf}
                              className={`p-1.5 rounded transition-colors ${isSelf ? 'text-gray-300 cursor-not-allowed' : 'text-red-600 hover:bg-red-50 cursor-pointer'}`}
                              title={isSelf ? 'No puedes eliminarte a ti mismo' : 'Eliminar Usuario'}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Create/Edit Form Sidebar */}
        {showForm && (
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden h-fit animate-fade-in lg:col-span-1">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50/50">
              <h3 className="font-semibold text-gray-800">
                {isEditing ? 'Editar Usuario' : 'Nuevo Usuario'}
              </h3>
              <button
                onClick={() => setShowForm(false)}
                className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full cursor-pointer transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* Notifications inside form */}
              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs flex items-start space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-500 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}
              {formSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg text-xs flex items-start space-x-2">
                  <Check className="w-4 h-4 shrink-0 text-emerald-500 mt-0.5" />
                  <span>{formSuccess}</span>
                </div>
              )}

              {/* Name */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                  Nombre Completo
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Juan Pérez"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-gray-950"
                />
              </div>

              {/* Username */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                  Nombre de Usuario (Login)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    disabled={isEditing}
                    placeholder="Ej. juanperez"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full px-3.5 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all disabled:bg-gray-100 disabled:text-gray-500 text-gray-950"
                  />
                </div>
                {!isEditing && (
                  <p className="text-[10px] text-gray-500 mt-1">
                    Se usará para iniciar sesión. Solo se permiten letras minúsculas, números y guiones bajos.
                  </p>
                )}
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                  Contraseña
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-3.5 pr-10 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-gray-950"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Department */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                  Área / Departamento
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
                    <Building className="w-4 h-4" />
                  </span>
                  <select
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all cursor-pointer text-gray-950"
                  >
                    <option value="General">General</option>
                    <option value="Operaciones">Operaciones</option>
                    <option value="Administración">Administración</option>
                    <option value="Ventas">Ventas</option>
                    <option value="Marketing">Marketing</option>
                    <option value="Sistemas / TI">Sistemas / TI</option>
                    <option value="Finanzas">Finanzas</option>
                  </select>
                </div>
              </div>

              {/* Role */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                  Rol del Usuario
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setRole('user')}
                    className={`flex items-center justify-center p-2.5 border rounded-lg text-xs font-bold transition-all cursor-pointer ${role === 'user' ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-sm' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                  >
                    <UserIcon className="w-4 h-4 mr-1.5" />
                    Colaborador
                  </button>
                  <button
                    type="button"
                    onClick={() => setRole('admin')}
                    className={`flex items-center justify-center p-2.5 border rounded-lg text-xs font-bold transition-all cursor-pointer ${role === 'admin' ? 'border-indigo-500 bg-indigo-50 text-indigo-700 shadow-sm' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                  >
                    <Shield className="w-4 h-4 mr-1.5" />
                    Administrador
                  </button>
                </div>
              </div>

              <div className="pt-2 border-t border-gray-100 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 py-2 border border-gray-300 rounded-lg text-xs font-bold text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-colors shadow-sm cursor-pointer"
                >
                  {isEditing ? 'Guardar Cambios' : 'Registrar'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
