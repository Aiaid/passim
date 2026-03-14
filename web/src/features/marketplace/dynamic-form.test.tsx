import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@/test/test-utils';
import userEvent from '@testing-library/user-event';
import type { SettingInfo } from '@/lib/api-client';
import { DynamicForm } from './dynamic-form';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en-US' } }),
}));

// -- Fixtures ----------------------------------------------------------------

const basicStringSetting: SettingInfo = {
  key: 'username',
  type: 'string',
  label: { 'en-US': 'Username' },
};

const passwordSetting: SettingInfo = {
  key: 'password',
  type: 'string',
  label: { 'en-US': 'Password' },
  default: '{{generated.password}}',
};

const selectSetting: SettingInfo = {
  key: 'protocol',
  type: 'string',
  label: { 'en-US': 'Protocol' },
  options: ['tcp', 'udp'],
};

const boolSetting: SettingInfo = {
  key: 'enabled',
  type: 'boolean',
  label: { 'en-US': 'Enabled' },
};

const sliderSetting: SettingInfo = {
  key: 'port',
  type: 'number',
  label: { 'en-US': 'Port' },
  min: 1,
  max: 65535,
};

const numberSetting: SettingInfo = {
  key: 'threads',
  type: 'number',
  label: { 'en-US': 'Threads' },
};

const advancedSetting: SettingInfo = {
  key: 'mtu',
  type: 'number',
  label: { 'en-US': 'MTU' },
  min: 500,
  max: 1500,
  advanced: true,
};

// -- Helpers -----------------------------------------------------------------

function renderForm(
  settings: SettingInfo[],
  onSubmit = vi.fn(),
  props: { isSubmitting?: boolean; submitLabel?: string } = {},
) {
  return {
    onSubmit,
    ...render(
      <DynamicForm settings={settings} onSubmit={onSubmit} {...props} />,
    ),
  };
}

// -- Tests -------------------------------------------------------------------

describe('DynamicForm', () => {
  // -- isGenerated behaviour -------------------------------------------------

  describe('isGenerated logic', () => {
    it('leaves generated default fields empty', () => {
      renderForm([passwordSetting]);
      const input = screen.getByLabelText('Password');
      expect(input).toHaveValue('');
    });

    it('uses non-generated default as value', () => {
      const setting: SettingInfo = {
        key: 'host',
        type: 'string',
        label: { 'en-US': 'Host' },
        default: 'localhost',
      };
      renderForm([setting]);
      expect(screen.getByLabelText('Host')).toHaveValue('localhost');
    });
  });

  // -- buildSchema behaviour -------------------------------------------------

  describe('buildSchema (through form validation)', () => {
    it('rejects empty required string field on submit', async () => {
      const user = userEvent.setup();
      const { onSubmit } = renderForm([basicStringSetting]);

      await user.click(screen.getByRole('button', { name: /marketplace\.deploy/i }));

      await waitFor(() => {
        expect(onSubmit).not.toHaveBeenCalled();
      });
    });

    it('allows empty generated (optional) field on submit', async () => {
      const user = userEvent.setup();
      const { onSubmit } = renderForm([passwordSetting]);

      await user.click(screen.getByRole('button', { name: /marketplace\.deploy/i }));

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalled();
      });
    });

    it('rejects number below min', async () => {
      const user = userEvent.setup();
      const setting: SettingInfo = {
        key: 'count',
        type: 'number',
        label: { 'en-US': 'Count' },
        min: 5,
      };
      const { onSubmit } = renderForm([setting]);

      const input = screen.getByLabelText('Count') as HTMLInputElement;
      // Use fireEvent to reliably set value on number inputs in jsdom
      await user.tripleClick(input);
      await user.keyboard('2');
      await user.click(screen.getByRole('button', { name: /marketplace\.deploy/i }));

      await waitFor(() => {
        expect(onSubmit).not.toHaveBeenCalled();
      });
    });

    it('rejects number above max', async () => {
      const user = userEvent.setup();
      const setting: SettingInfo = {
        key: 'count',
        type: 'number',
        label: { 'en-US': 'Count' },
        max: 10,
      };
      const { onSubmit } = renderForm([setting]);

      const input = screen.getByLabelText('Count');
      await user.clear(input);
      await user.type(input, '99');
      await user.click(screen.getByRole('button', { name: /marketplace\.deploy/i }));

      await waitFor(() => {
        expect(onSubmit).not.toHaveBeenCalled();
      });
    });

    it('boolean field is always optional (form submits with false)', async () => {
      const user = userEvent.setup();
      const { onSubmit } = renderForm([boolSetting]);

      await user.click(screen.getByRole('button', { name: /marketplace\.deploy/i }));

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalled();
      });
    });
  });

  // -- buildDefaults behaviour -----------------------------------------------

  describe('buildDefaults (through rendered values)', () => {
    it('sets generated default to empty string', () => {
      renderForm([passwordSetting]);
      expect(screen.getByLabelText('Password')).toHaveValue('');
    });

    it('sets explicit default value', () => {
      const setting: SettingInfo = {
        key: 'region',
        type: 'string',
        label: { 'en-US': 'Region' },
        default: 'us-east-1',
      };
      renderForm([setting]);
      expect(screen.getByLabelText('Region')).toHaveValue('us-east-1');
    });

    it('defaults boolean with no default to unchecked', () => {
      renderForm([boolSetting]);
      const switchEl = screen.getByRole('switch');
      expect(switchEl).toHaveAttribute('data-state', 'unchecked');
    });
  });

  // -- Field type rendering --------------------------------------------------

  describe('field type rendering', () => {
    it('renders text input for plain string', () => {
      renderForm([basicStringSetting]);
      const input = screen.getByLabelText('Username');
      expect(input).toHaveAttribute('type', 'text');
    });

    it('renders password input when key contains "password"', () => {
      renderForm([passwordSetting]);
      const input = screen.getByLabelText('Password');
      expect(input).toHaveAttribute('type', 'password');
    });

    it('renders Select trigger for string with options', () => {
      renderForm([selectSetting]);
      expect(screen.getByText('Protocol')).toBeInTheDocument();
      // Radix Select renders a combobox trigger
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    it('renders Switch for boolean field', () => {
      renderForm([boolSetting]);
      expect(screen.getByRole('switch')).toBeInTheDocument();
    });

    it('renders Slider for number with min and max', () => {
      renderForm([sliderSetting]);
      expect(screen.getByText('Port')).toBeInTheDocument();
      expect(screen.getByRole('slider')).toBeInTheDocument();
    });

    it('renders number input for number without range', () => {
      renderForm([numberSetting]);
      const input = screen.getByLabelText('Threads');
      expect(input).toHaveAttribute('type', 'number');
    });
  });

  // -- Advanced settings -----------------------------------------------------

  describe('advanced settings', () => {
    it('does not show advanced fields initially', () => {
      renderForm([basicStringSetting, advancedSetting]);
      expect(screen.getByText('Username')).toBeInTheDocument();
      expect(screen.queryByText('MTU')).not.toBeInTheDocument();
    });

    it('shows advanced fields after clicking toggle', async () => {
      const user = userEvent.setup();
      renderForm([basicStringSetting, advancedSetting]);

      await user.click(screen.getByText('marketplace.advanced_settings'));

      expect(screen.getByText('MTU')).toBeInTheDocument();
    });
  });

  // -- Submit behaviour ------------------------------------------------------

  describe('submit', () => {
    it('strips empty values from submitted data', async () => {
      const user = userEvent.setup();
      const setting: SettingInfo = {
        key: 'token',
        type: 'string',
        label: { 'en-US': 'Token' },
        default: '{{generated.token}}',
      };
      const { onSubmit } = renderForm([setting]);

      await user.click(screen.getByRole('button', { name: /marketplace\.deploy/i }));

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith({});
      });
    });
  });
});
