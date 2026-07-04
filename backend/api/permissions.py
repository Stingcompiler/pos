"""
Role-Based Access Control (RBAC) permissions for DRF.

- Manager:    Full CRUD access.
- Supervisor: Full access EXCEPT DELETE (403 Forbidden).
- Employee:   Read-Only for SparePart/Category/CarModel.
              Create (POST) only for Invoice/InvoiceItem.
"""

from rest_framework.permissions import BasePermission


class IsManager(BasePermission):
    """Full access for managers."""

    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and request.user.role == 'manager'
        )


class RoleBasedPermission(BasePermission):
    """
    Dynamic permission class that checks the user's role
    against the request method and the view being accessed.
    """

    # Views that employees can POST to (create invoices)
    EMPLOYEE_POST_VIEWS = ('InvoiceViewSet', 'InvoiceItemViewSet')

    def has_permission(self, request, view):
        user = request.user

        if not user or not user.is_authenticated:
            return False

        role = user.role

        # Manager: full access
        if role == 'manager':
            return True

        # Supervisor: everything except DELETE
        if role == 'supervisor':
            if request.method == 'DELETE':
                return False
            return True

        # Employee: read-only + POST for invoices
        if role == 'employee':
            if request.method in ('GET', 'HEAD', 'OPTIONS'):
                return True

            if request.method == 'POST':
                view_name = view.__class__.__name__
                if view_name in self.EMPLOYEE_POST_VIEWS:
                    return True

            return False

        return False
