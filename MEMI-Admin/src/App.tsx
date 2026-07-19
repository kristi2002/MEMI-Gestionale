import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { AuthProvider, useAuth } from '@/hooks/use-auth';
import { LoginPage } from '@/pages/login';
import { buildRoutes } from '@/routes';
import { ProductFormPage } from '@/pages/product-form';
import { ProductSchedaPage } from '@/pages/product-scheda';
import { SupplierFormPage } from '@/pages/suppliers';
import { GiftcardFormPage } from '@/pages/giftcards';
import { DiscountFormPage } from '@/pages/discounts';
import { ExpenseFormPage } from '@/pages/expenses';
import { SupplierInvoiceFormPage } from '@/pages/supplier-invoices';
import { PickupFormPage } from '@/pages/pickup';
import { TransferFormPage } from '@/pages/transfers';
import { SegmentFormPage } from '@/pages/segments';
import { SegmentMembersPage } from '@/pages/segment-members';
import { ShippingZoneFormPage } from '@/pages/shipping-zones';
import { CustomerFormPage } from '@/pages/customers';
import { CustomerSchedaPage } from '@/pages/customer-scheda';
import { StaffFormPage } from '@/pages/staff';
import { ColorFormPage } from '@/pages/colors';
import { CourierFormPage } from '@/pages/couriers';
import { AutomationFormPage } from '@/pages/automations';
import { CategoryFormPage, CollectionFormPage } from '@/pages/taxonomy';
import { ReturnFormPage } from '@/pages/returns';
import { NewsletterSubscriberFormPage, NewsletterComposePage } from '@/pages/newsletter';
import { NewsletterCampaignsPage } from '@/pages/newsletter-campaigns';
import { LoyaltyRedemptionsPage } from '@/pages/loyalty-redemptions';
import { LifecycleCampaignFormPage } from '@/pages/lifecycle';
import { PurchaseOrderFormPage } from '@/pages/purchase-order-form';
import { AppFormPage } from '@/pages/apps';

function FullScreenSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

/** Gate: /me must succeed. On 401 the api layer already redirects; here we
 *  guard the initial load and unauthenticated navigation. */
function RequireAuth() {
  const { isLoading, isError, me } = useAuth();
  const location = useLocation();
  if (isLoading) return <FullScreenSpinner />;
  if (isError || !me) return <Navigate to="/login" state={{ from: location }} replace />;
  return <AppShell />;
}

export default function App() {
  const routes = buildRoutes();
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<RequireAuth />}>
          <Route path="/products/new" element={<ProductFormPage />} />
          <Route path="/products/:id/edit" element={<ProductFormPage />} />
          <Route path="/products/:id/scheda" element={<ProductSchedaPage />} />
          <Route path="/suppliers/new" element={<SupplierFormPage />} />
          <Route path="/suppliers/:id/edit" element={<SupplierFormPage />} />
          <Route path="/purchase-orders/new" element={<PurchaseOrderFormPage />} />
          <Route path="/purchase-orders/:id/edit" element={<PurchaseOrderFormPage />} />
          <Route path="/apps/new" element={<AppFormPage />} />
          <Route path="/apps/:key/edit" element={<AppFormPage />} />
          <Route path="/giftcards/new" element={<GiftcardFormPage />} />
          <Route path="/giftcards/:id/edit" element={<GiftcardFormPage />} />
          <Route path="/discounts/new" element={<DiscountFormPage />} />
          <Route path="/discounts/:id/edit" element={<DiscountFormPage />} />
          <Route path="/bills/new" element={<ExpenseFormPage />} />
          <Route path="/bills/:id/edit" element={<ExpenseFormPage />} />
          <Route path="/supplier-invoices/new" element={<SupplierInvoiceFormPage />} />
          <Route path="/supplier-invoices/:id/edit" element={<SupplierInvoiceFormPage />} />
          <Route path="/pickup/new" element={<PickupFormPage />} />
          <Route path="/pickup/:id/edit" element={<PickupFormPage />} />
          <Route path="/transfers/new" element={<TransferFormPage />} />
          <Route path="/transfers/:id/edit" element={<TransferFormPage />} />
          <Route path="/segments/new" element={<SegmentFormPage />} />
          <Route path="/segments/:id/edit" element={<SegmentFormPage />} />
          <Route path="/segments/:id/customers" element={<SegmentMembersPage />} />
          <Route path="/shipping-zones/new" element={<ShippingZoneFormPage />} />
          <Route path="/shipping-zones/:id/edit" element={<ShippingZoneFormPage />} />
          <Route path="/customers/new" element={<CustomerFormPage />} />
          <Route path="/customers/:id/edit" element={<CustomerFormPage />} />
          <Route path="/customers/:id" element={<CustomerSchedaPage />} />
          <Route path="/staff/new" element={<StaffFormPage />} />
          <Route path="/staff/:id/edit" element={<StaffFormPage />} />
          <Route path="/colors/new" element={<ColorFormPage />} />
          <Route path="/colors/:id/edit" element={<ColorFormPage />} />
          <Route path="/couriers/new" element={<CourierFormPage />} />
          <Route path="/couriers/:code/edit" element={<CourierFormPage />} />
          <Route path="/automations/new" element={<AutomationFormPage />} />
          <Route path="/automations/:id/edit" element={<AutomationFormPage />} />
          <Route path="/categories/new" element={<CategoryFormPage />} />
          <Route path="/categories/:id/edit" element={<CategoryFormPage />} />
          <Route path="/collections/new" element={<CollectionFormPage />} />
          <Route path="/collections/:id/edit" element={<CollectionFormPage />} />
          <Route path="/returns/:id/edit" element={<ReturnFormPage />} />
          <Route path="/newsletter/new" element={<NewsletterSubscriberFormPage />} />
          <Route path="/newsletter/:id/edit" element={<NewsletterSubscriberFormPage />} />
          <Route path="/newsletter/compose" element={<NewsletterComposePage />} />
          <Route path="/newsletter/campaigns" element={<NewsletterCampaignsPage />} />
          <Route path="/loyalty/redemptions" element={<LoyaltyRedemptionsPage />} />
          <Route path="/lifecycle/:type/edit" element={<LifecycleCampaignFormPage />} />
          {routes.map((r) => (
            <Route key={r.path} path={r.path} element={r.element} />
          ))}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
