import { useEffect, useState } from 'react';
import { useI18n } from '@extension/shared';
import { requestFullAccess, useFullAccess } from '@src/access';
import { primaryButtonClass, buttonClass } from '@src/ui';

/**
 * Compact permission prompt, opened by the background as a small popup window over the
 * current tab (options/index.html#grant). One click on Allow brings up Chrome's own dialog.
 */
const Grant = () => {
  const { t } = useI18n();
  const granted = useFullAccess();
  const [declined, setDeclined] = useState(false);

  useEffect(() => {
    if (granted) {
      const timer = setTimeout(() => window.close(), 900);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [granted]);

  const allow = async () => {
    setDeclined(false);
    if (!(await requestFullAccess())) setDeclined(true);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-5 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <div className="flex w-full max-w-sm flex-col gap-4">
        <div className="flex items-center gap-3">
          <img src="/icon.svg" alt="" className="h-8 w-8" />
          <h1 className="text-base font-semibold">{t('grant.title')}</h1>
        </div>

        {granted ? (
          <p className="text-sm text-green-700 dark:text-green-400">{t('grant.allowed')}</p>
        ) : (
          <>
            <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
              {t('grant.body')}
            </p>
            {declined ? (
              <p className="text-xs text-amber-600 dark:text-amber-500">{t('grant.declined')}</p>
            ) : null}
            <div className="flex justify-end gap-2">
              <button type="button" className={buttonClass} onClick={() => window.close()}>
                {t('common.notNow')}
              </button>
              <button type="button" className={primaryButtonClass} disabled={granted === null} onClick={allow}>
                {t('common.allow')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Grant;
