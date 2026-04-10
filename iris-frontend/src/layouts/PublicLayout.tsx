import { Outlet } from 'react-router-dom';

export default function PublicLayout() {
  return (
    <div>
      {/* Add a public navbar here later */}
      <Outlet />
    </div>
  );
}
