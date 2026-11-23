import Button from '@atlaskit/button/new';
import Modal, { ModalBody, ModalFooter, ModalHeader, ModalTitle, ModalTransition } from '@atlaskit/modal-dialog';
import type { ReactNode } from 'react';

/** A yes/no dialog. `confirm` is the button text and should repeat the action ("Replace questions"). */
export const ConfirmDialog = ({
  open,
  title,
  children,
  confirm,
  onConfirm,
  onCancel,
  appearance = 'primary',
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirm: string;
  onConfirm: () => void;
  onCancel: () => void;
  appearance?: 'primary' | 'warning' | 'danger';
}) => (
  <ModalTransition>
    {open && (
      <Modal onClose={onCancel}>
        <ModalHeader>
          <ModalTitle appearance={appearance === 'primary' ? undefined : appearance}>{title}</ModalTitle>
        </ModalHeader>
        <ModalBody>{children}</ModalBody>
        <ModalFooter>
          <Button appearance="subtle" onClick={onCancel}>
            Cancel
          </Button>
          <Button appearance={appearance} onClick={onConfirm}>
            {confirm}
          </Button>
        </ModalFooter>
      </Modal>
    )}
  </ModalTransition>
);
