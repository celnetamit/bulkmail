'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useToast } from '@/components/toast-provider';

export function CampaignDetailActions({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [copying, setCopying] = useState(false);

  async function copyCampaign() {
    setCopying(true);
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/duplicate`, { method: 'POST' });
      const data = (await response.json().catch(() => ({}))) as { error?: string; campaign?: { id?: string } };
      if (!response.ok || !data.campaign?.id) {
        toast.error('Campaign copy failed', data.error || 'The campaign could not be duplicated.');
        return;
      }

      toast.success('Campaign copied', 'A new draft was created from this sent campaign.');
      router.push(`/dashboard/campaigns/create?campaignId=${data.campaign.id}`);
    } finally {
      setCopying(false);
    }
  }

  return (
    <div className="detail-actions campaign-detail-actions">
      <button className="btn-primary" type="button" onClick={copyCampaign} disabled={copying}>
        {copying ? 'Copying...' : 'Copy to Draft'}
      </button>
      <Link className="btn-secondary" href={`/dashboard/analytics?campaignId=${campaignId}`}>
        View Analytics
      </Link>
      <Link className="btn-secondary" href="/dashboard/campaigns">
        Back to Campaigns
      </Link>
    </div>
  );
}
