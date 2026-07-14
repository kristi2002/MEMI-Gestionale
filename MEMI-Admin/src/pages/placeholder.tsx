import { Link } from 'react-router-dom';
import { Construction, ArrowRight } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

/**
 * Placeholder for views not yet ported from the legacy jQuery admin. Keeps the
 * full IA navigable during the incremental migration; the legacy admin remains
 * the source of truth for these until each is rebuilt.
 */
export function PlaceholderPage({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <PageHeader title={title} subtitle={subtitle} />
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-warning/15 text-warning">
            <Construction className="h-7 w-7" />
          </span>
          <div>
            <p className="text-lg font-semibold">Vista in migrazione</p>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              Questa sezione è ancora servita dal gestionale classico. Sarà ricostruita in React in un
              batch successivo, con la stessa DataTable e le azioni in blocco delle viste già pronte.
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link to="/">
              Torna alla dashboard <ArrowRight />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
