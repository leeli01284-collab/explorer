import { ErrorCard } from '@components/common/ErrorCard';
import { BorshAccountsCoder } from '@coral-xyz/anchor';
import { IdlTypeDef } from '@coral-xyz/anchor/dist/cjs/idl';
import { Account } from '@providers/accounts';
import { useAnchorProgram } from '@providers/anchor';
import { useCluster } from '@providers/cluster';
import { getAnchorProgramName, mapAccountToRows } from '@utils/anchor';
import React, { useMemo } from 'react';

/**
 * Decodes account data using the Anchor program's IDL
 * @param anchorProgram The Anchor program instance
 * @param rawData The raw account data buffer
 * @param accountAddress The account address for logging purposes
 * @returns Object containing decoded account data and account definition
 */
function decodeAccountData(
    anchorProgram: ReturnType<typeof useAnchorProgram>,
    rawData: Buffer | undefined,
    accountAddress: string
): { accountDef: IdlTypeDef | undefined; decodedAccountData: unknown | null; error?: string } {
    if (!anchorProgram || !rawData) {
        return { accountDef: undefined, decodedAccountData: null };
    }

    try {
        const coder = new BorshAccountsCoder(anchorProgram.idl);
        
        // Ensure rawData is a Buffer for discriminator comparison
        const dataBuffer = rawData as Buffer;
        
        if (dataBuffer.length < 8) {
            console.error(
                `[AnchorAccountCard] Account data too short for discriminator check. Account: ${accountAddress}, Length: ${dataBuffer.length}`
            );
            return {
                accountDef: undefined,
                decodedAccountData: null,
                error: 'Account data is too short to contain a valid discriminator',
            };
        }

        const accountDef = anchorProgram.idl.accounts?.find((accountType: IdlTypeDef) => {
            try {
                const discriminator = BorshAccountsCoder.accountDiscriminator(accountType.name);
                return dataBuffer.slice(0, 8).equals(discriminator);
            } catch (err) {
                console.warn(
                    `[AnchorAccountCard] Failed to compute discriminator for account type: ${accountType.name}`,
                    err
                );
                return false;
            }
        });

        if (!accountDef) {
            console.warn(
                `[AnchorAccountCard] No matching account type found. Account: ${accountAddress}, Program: ${anchorProgram.idl.name}`
            );
            return {
                accountDef: undefined,
                decodedAccountData: null,
                error: 'No matching account type found in the IDL',
            };
        }

        try {
            const decodedAccountData = coder.decode(accountDef.name, dataBuffer);
            console.log(
                `[AnchorAccountCard] Successfully decoded account. Type: ${accountDef.name}, Account: ${accountAddress}`
            );
            return { accountDef, decodedAccountData };
        } catch (decodeErr) {
            console.error(
                `[AnchorAccountCard] Failed to decode account data. Account: ${accountAddress}, Type: ${accountDef.name}, Error:`,
                decodeErr instanceof Error ? decodeErr.message : decodeErr
            );
            return {
                accountDef,
                decodedAccountData: null,
                error: `Decoding failed: ${decodeErr instanceof Error ? decodeErr.message : 'Unknown error'}`,
            };
        }
    } catch (err) {
        console.error(
            `[AnchorAccountCard] Unexpected error during account decoding. Account: ${accountAddress}, Error:`,
            err instanceof Error ? err.message : err
        );
        return {
            accountDef: undefined,
            decodedAccountData: null,
            error: `Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}`,
        };
    }
}

export function AnchorAccountCard({ account }: { account: Account }) {
    const { lamports } = account;
    const { url } = useCluster();
    const anchorProgram = useAnchorProgram(account.owner.toString(), url);
    const rawData = account.data.raw;
    const programName = getAnchorProgramName(anchorProgram) || 'Unknown Program';
    const accountAddress = account.pubkey.toString();

    const { accountDef, decodedAccountData, error } = useMemo(() => {
        return decodeAccountData(anchorProgram, rawData, accountAddress);
    }, [anchorProgram, rawData, accountAddress]);

    if (lamports === undefined) return null;
    
    if (!anchorProgram) {
        return <ErrorCard text="No Anchor IDL found" subtext="This account's program does not have a public Anchor IDL available." />;
    }
    
    if (!decodedAccountData || !accountDef) {
        const errorMessage = error || 'Failed to decode account data according to the public Anchor interface';
        return (
            <ErrorCard 
                text={errorMessage} 
                subtext="The account data could not be parsed. It may be using a different format or the IDL may be outdated."
            />
        );
    }

    return (
        <div>
            <div className="card">
                <div className="card-header">
                    <div className="row align-items-center">
                        <div className="col">
                            <h3 className="card-header-title">
                                {programName}: {accountDef.name}
                            </h3>
                        </div>
                    </div>
                </div>

                <div className="table-responsive mb-0">
                    <table className="table table-sm table-nowrap card-table">
                        <thead>
                            <tr>
                                <th className="w-1" title="The name of the field in the account structure">
                                    Field
                                </th>
                                <th className="w-1" title="The data type of the field">
                                    Type
                                </th>
                                <th className="w-1" title="The current value stored in the field">
                                    Value
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {mapAccountToRows(decodedAccountData, accountDef as IdlTypeDef, anchorProgram.idl)}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
